// « Pratique » (lot R8q, maquette R8.12) : la station-service et le lavage les plus proches, de moi ou de ma sortie.
// Sources : lavage = OpenStreetMap par Overpass (cache `wash:<département>`, une semaine), stations-service = jeu public des
// prix des carburants (cache `fuel:<département>`, un jour). Les sources ne reçoivent JAMAIS une position : seulement un code de
// département. La position d'une personne n'arrive ici qu'arrondie à la case de 0,1° (`weatherCell`, dès la route) ; elle
// n'est écrite nulle part, ni journalisée, ni rattachée au compte. Distances et tri fin : le téléphone, avec sa position exacte.
import {
  homeLabels,
  myWeatherPlaces,
  nearestDepartments,
  PRACTICAL_DEPARTMENTS,
  type PracticalData,
  type PracticalOrigin,
  type PracticalPlace,
  placesAround,
  practicalPlaceId,
  practicalTexts,
  type WeatherCell,
} from "@orasso/shared";
import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "../../db/client";
import { applications, eventDays, events, externalCache, profileWeatherPlaces, tickets } from "../../db/schema";
import { now } from "../../lib/deps";
import { notFound } from "../../lib/errors";
import { EXTERNAL_BUDGET_MS, withinBudget } from "../../lib/external/cache";
import { FUEL_MAX_STALE_MS, fuelNear } from "../../lib/external/fuel";
import { washNear } from "../../lib/external/overpass";
import type { Viewer } from "../../lib/session";

/** Ce que la route donne au service : la case de 0,1° (jamais la position reçue), ou le choix « ville » / « sortie ». */
export type PracticalTarget =
  | { near: "position"; cell: WeatherCell }
  | { near: "city" }
  | { near: "outing"; eventId?: string };

type OutingEvent = { id: string; title: string; lat: number | null; lng: number | null; startsMs: number };

/** Au-delà, la source ne sert plus sa liste périmée (lavage : 30 jours dans `overpass.ts`, stations : `FUEL_MAX_STALE_MS`). */
const STALE_LIMIT_MS = { wash: 30 * 24 * 3_600_000, fuel: FUEL_MAX_STALE_MS } as const;

const attribution = { wash: homeLabels.washAttribution, fuel: homeLabels.fuelAttribution };

export const practicalService = {
  async get(v: Viewer, target: PracticalTarget, budgetMs = EXTERNAL_BUDGET_MS): Promise<PracticalData> {
    const origin = await this.origin(v, target);
    if (!origin) return { origin: null, places: [], partial: false, attribution };
    return { origin, ...(await this.placesAround(origin, budgetMs)), attribution };
  },

  async origin(v: Viewer, target: PracticalTarget): Promise<PracticalOrigin | null> {
    if (target.near === "position") {
      return { kind: "cell", label: practicalTexts.myPosition, lat: target.cell.lat, lng: target.cell.lng };
    }
    if (target.near === "city") {
      // Le premier lieu de « Ma météo » (lieu choisi, sinon la préfecture du premier département) ; jamais la position.
      const saved = await db
        .select()
        .from(profileWeatherPlaces)
        .where(eq(profileWeatherPlaces.userId, v.user.id))
        .orderBy(asc(profileWeatherPlaces.slot));
      const first = myWeatherPlaces({ saved, departments: v.profile.departments })[0];
      return first ? { kind: "city", label: first.label, lat: first.lat, lng: first.lng } : null;
    }
    const event = await this.outing(v, target.eventId);
    if (target.eventId && !event) throw notFound("Événement introuvable");
    if (!event || event.lat === null || event.lng === null) return null;
    return { kind: "outing", label: event.title, lat: event.lat, lng: event.lng };
  },

  /**
   * Ma prochaine sortie : l'événement publié, à venir ou en cours, où j'ai une place (candidature véhicule retenue, billet
   * valable ou déjà contrôlé). Avec `eventId` : cet événement, seulement si j'y ai une place (sinon `null`).
   */
  async outing(v: Viewer, eventId?: string): Promise<OutingEvent | null> {
    const t = now().getTime();
    const byEvent = (col: typeof applications.eventId | typeof tickets.eventId) => (eventId ? [eq(col, eventId)] : []);
    const apps = await db
      .select({
        id: events.id,
        title: events.title,
        lat: events.lat,
        lng: events.lng,
        startsAt: events.startsAt,
        endsAt: events.endsAt,
        dayStartsAt: eventDays.startsAt,
        dayEndsAt: eventDays.endsAt,
      })
      .from(applications)
      .innerJoin(events, eq(events.id, applications.eventId))
      .leftJoin(eventDays, eq(eventDays.id, applications.eventDayId))
      .where(
        and(
          eq(applications.userId, v.user.id),
          eq(applications.kind, "vehicle"),
          eq(applications.status, "accepted"),
          eq(events.status, "published"),
          ...byEvent(applications.eventId),
        ),
      );
    const held = await db
      .select({
        id: events.id,
        title: events.title,
        lat: events.lat,
        lng: events.lng,
        startsAt: events.startsAt,
        endsAt: events.endsAt,
      })
      .from(tickets)
      .innerJoin(events, eq(events.id, tickets.eventId))
      .where(
        and(
          eq(tickets.userId, v.user.id),
          inArray(tickets.status, ["valid", "used"]),
          eq(events.status, "published"),
          ...byEvent(tickets.eventId),
        ),
      );
    const candidates: OutingEvent[] = [
      // Une journée choisie se juge sur cette journée ; sans journée, sur l'événement entier.
      ...apps
        .filter((a) => (a.dayEndsAt ?? a.endsAt).getTime() > t)
        .map((a) => ({ ...a, startsMs: (a.dayStartsAt ?? a.startsAt).getTime() })),
      ...held.filter((x) => x.endsAt.getTime() > t).map((x) => ({ ...x, startsMs: x.startsAt.getTime() })),
    ];
    candidates.sort((a, b) => a.startsMs - b.startsMs || a.id.localeCompare(b.id));
    return candidates[0] ?? null;
  },

  /**
   * Les lieux des deux départements les plus proches de l'origine, dans le rayon, du plus proche au plus loin. `partial` :
   * une source n'a pas répondu dans le budget et n'a rien en cache (le chargement continue pour la fois suivante).
   */
  async placesAround(
    origin: PracticalOrigin,
    budgetMs: number,
  ): Promise<{ places: PracticalPlace[]; partial: boolean }> {
    const departments = nearestDepartments(origin, PRACTICAL_DEPARTMENTS);
    const loads = departments.flatMap((d) => [
      withinBudget(washNear(d), [], budgetMs).then((list) =>
        list.map(
          (p): PracticalPlace => ({
            id: practicalPlaceId("wash", p.lat, p.lng),
            kind: "wash",
            name: p.name,
            address: p.address,
            lat: p.lat,
            lng: p.lng,
          }),
        ),
      ),
      // Liste blanche : ni prix ni heure de mise à jour ne sortent d'ici.
      withinBudget(fuelNear(d), [], budgetMs).then((list) =>
        list.map(
          (p): PracticalPlace => ({
            id: practicalPlaceId("fuel", p.lat, p.lng),
            kind: "fuel",
            name: p.name,
            address: p.address,
            lat: p.lat,
            lng: p.lng,
          }),
        ),
      ),
    ]);
    const all = (await Promise.all(loads)).flat();
    // Une source muette (rien de servable en cache : en panne, désactivée ou trop lente) rend la réponse partielle.
    const keys = departments.flatMap((d) => [`wash:${d}`, `fuel:${d}`]);
    const rows = await db
      .select({ key: externalCache.key, fetchedAt: externalCache.fetchedAt })
      .from(externalCache)
      .where(inArray(externalCache.key, keys));
    const t = now().getTime();
    const servable = new Set(
      rows
        .filter((r) => t - r.fetchedAt.getTime() < STALE_LIMIT_MS[r.key.startsWith("wash:") ? "wash" : "fuel"])
        .map((r) => r.key),
    );
    const partial = keys.some((k) => !servable.has(k));
    return { places: placesAround(all, origin), partial };
  },
};
