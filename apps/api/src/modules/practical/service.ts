// « Pratique » (lot R8q, maquette R8.12) : la station-service et le lavage les plus proches, de moi ou de ma sortie.
// Sources : OpenStreetMap par Overpass, en une seule requête par département (cache `wash:<département>`, une semaine) : les lavages
// et les stations-service ; jeu public des prix des carburants (cache `fuel:<département>`, un jour) : les stations-service. Les
// stations des deux sources sont fusionnées (petit lot de fin D) : le jeu public gagne un doublon, OpenStreetMap ajoute les stations
// qui ne déclarent pas de prix. Les sources ne reçoivent JAMAIS une position : seulement un code de
// département. La position d'une personne n'arrive ici qu'arrondie à la case de 0,1° (`weatherCell`, dès la route) ; elle
// n'est écrite nulle part, ni journalisée, ni rattachée au compte. Distances et tri fin : le téléphone, avec sa position exacte.
import {
  departmentsAround,
  homeLabels,
  myWeatherPlaces,
  type PracticalData,
  type PracticalKind,
  type PracticalOrigin,
  type PracticalPlace,
  placesAround,
  practicalPlaceId,
  practicalTexts,
  type WeatherCell,
  withoutTwins,
} from "@orasso/shared";
import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "../../db/client";
import { applications, eventDays, events, externalCache, profileWeatherPlaces, tickets } from "../../db/schema";
import { now } from "../../lib/deps";
import { notFound } from "../../lib/errors";
import { EXTERNAL_BUDGET_MS, withinBudget } from "../../lib/external/cache";
import { FUEL_MAX_STALE_MS, fuelNear } from "../../lib/external/fuel";
import { type CachedOsmPlace, isFuel, isWash, osmNear } from "../../lib/external/overpass";
import type { Viewer } from "../../lib/session";

/** Ce que la route donne au service : la case de 0,1° (jamais la position reçue), ou le choix « ville » / « sortie ». */
export type PracticalTarget =
  | { near: "position"; cell: WeatherCell }
  | { near: "city" }
  | { near: "outing"; eventId?: string };

type OutingEvent = { id: string; title: string; lat: number | null; lng: number | null; startsMs: number };

/** Au-delà, la source ne sert plus sa liste périmée (lavage : 30 jours dans `overpass.ts`, stations : `FUEL_MAX_STALE_MS`). */
const STALE_LIMIT_MS = { wash: 30 * 24 * 3_600_000, fuel: FUEL_MAX_STALE_MS } as const;

/** Qui a servi les stations : le jeu public, OpenStreetMap, ou les deux (alors les deux sont cités). */
const fuelAttribution = (gov: boolean, osm: boolean) =>
  gov && osm ? practicalTexts.fuelSourcesBoth : osm ? practicalTexts.fuelSourcesOsm : homeLabels.fuelAttribution;
const baseAttribution = { wash: homeLabels.washAttribution, fuel: homeLabels.fuelAttribution };
type Attribution = { wash: string; fuel: string };

export const practicalService = {
  async get(v: Viewer, target: PracticalTarget, budgetMs = EXTERNAL_BUDGET_MS): Promise<PracticalData> {
    const origin = await this.origin(v, target);
    if (!origin) return { origin: null, places: [], partial: false, attribution: baseAttribution };
    return { origin, ...(await this.placesAround(origin, budgetMs)) };
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
   * Les lieux des départements qui coupent la zone, dans le rayon, du plus proche au plus loin. `partial` : une source n'a pas
   * répondu dans le budget et n'a rien en cache (le chargement continue pour la fois suivante).
   */
  async placesAround(
    origin: PracticalOrigin,
    budgetMs: number,
  ): Promise<{ places: PracticalPlace[]; partial: boolean; attribution: Attribution }> {
    // Tous les départements qui coupent la zone de 30 km (petite couronne comprise), pas seulement les deux plus proches.
    const departments = departmentsAround(origin);
    type Place = { name: string; address: string | null; lat: number; lng: number };
    type Listed =
      | { source: "osm"; key: string; list: CachedOsmPlace[] | null }
      | { source: "gov"; key: string; list: Place[] | null };
    // `null` : la source n'a pas répondu dans le budget (le chargement continue) ; le cache toléré sert alors de repli.
    const loads: Promise<Listed>[] = departments.flatMap((d) => [
      withinBudget<CachedOsmPlace[] | null>(osmNear(d), null, budgetMs).then(
        (list): Listed => ({ source: "osm", key: `wash:${d}`, list }),
      ),
      withinBudget<Place[] | null>(fuelNear(d), null, budgetMs).then(
        (list): Listed => ({ source: "gov", key: `fuel:${d}`, list }),
      ),
    ]);
    const listed = await Promise.all(loads);
    const keys = listed.map((l) => l.key);
    const rows = await db
      .select({ key: externalCache.key, fetchedAt: externalCache.fetchedAt, data: externalCache.data })
      .from(externalCache)
      .where(inArray(externalCache.key, keys));
    const t = now().getTime();
    const servable = new Map(
      rows
        .filter((r) => t - r.fetchedAt.getTime() < STALE_LIMIT_MS[r.key.startsWith("wash:") ? "wash" : "fuel"])
        .map((r) => [r.key, r.data as unknown]),
    );
    let partial = false;
    const osm: CachedOsmPlace[] = [];
    const gov: Place[] = [];
    for (const l of listed) {
      // Source lente : partiel, même si un cache toléré est servi (l'écran relit une fois).
      if (l.list === null) partial = true;
      // Une source muette (rien de servable en cache : en panne, désactivée) rend aussi la réponse partielle.
      if (!servable.has(l.key)) partial = true;
      const list = (l.list ?? servable.get(l.key) ?? []) as Place[];
      if (l.source === "osm") osm.push(...(list as CachedOsmPlace[]));
      else gov.push(...list);
    }
    // Stations : le jeu public d'abord ; une station d'OpenStreetMap à moins de 60 m d'une du jeu public est la même (elle perd).
    const osmFuel = withoutTwins(gov, osm.filter(isFuel));
    // Liste blanche : ni prix ni heure de mise à jour ne sortent d'ici.
    const place = (kind: PracticalKind, p: Place): PracticalPlace => ({
      id: practicalPlaceId(kind, p.lat, p.lng),
      kind,
      name: p.name,
      address: p.address,
      lat: p.lat,
      lng: p.lng,
    });
    const all: PracticalPlace[] = [
      ...osm.filter(isWash).map((p) =>
        // Une station avec lavage sans nom : le libellé d'un lavage, pas celui d'une station.
        place(
          "wash",
          p.as === "both" && p.name === homeLabels.fuelUnnamed ? { ...p, name: homeLabels.washUnnamed } : p,
        ),
      ),
      ...gov.map((p) => place("fuel", p)),
      ...osmFuel.map((p) => place("fuel", p)),
    ];
    const places = placesAround(all, origin);
    // Les deux sources sont citées quand les deux ont servi une station de la réponse.
    const govIds = new Set(gov.map((p) => practicalPlaceId("fuel", p.lat, p.lng)));
    const fuelPlaces = places.filter((p) => p.kind === "fuel");
    const usedGov = fuelPlaces.some((p) => govIds.has(p.id));
    const usedOsm = fuelPlaces.some((p) => !govIds.has(p.id));
    return {
      places,
      partial,
      attribution: { wash: homeLabels.washAttribution, fuel: fuelAttribution(usedGov || !usedOsm, usedOsm) },
    };
  },
};
