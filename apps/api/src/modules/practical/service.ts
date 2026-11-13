// « Pratique » (lot R8q, maquette R8.12) : la station-service et le lavage les plus proches, de moi ou de ma sortie.
// Sources : OpenStreetMap par Overpass, en une seule requête par département (cache `osm:<département>`, une semaine) : les lavages
// et les stations-service ; jeu public des prix des carburants (cache `fuel:<département>`, un jour) : les stations-service. Les
// stations des deux sources sont fusionnées (petit lot de fin D) : le jeu public gagne un doublon, OpenStreetMap ajoute les stations
// qui ne déclarent pas de prix. Les sources ne reçoivent JAMAIS une position : seulement un code de
// département. La position d'une personne n'arrive ici qu'arrondie à la case de 0,1° (`weatherCell`, dès la route) ; elle
// n'est écrite nulle part, ni journalisée, ni rattachée au compte. Distances et tri fin : le téléphone, avec sa position exacte.
import {
  departmentsAround,
  distanceKm,
  homeLabels,
  myWeatherPlaces,
  PRACTICAL_RADIUS_KM,
  type PracticalData,
  type PracticalKind,
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
import { FUEL_MAX_STALE_MS, fuelState } from "../../lib/external/fuel";
import { osmState, WASH_MAX_STALE_MS, WASH_TTL_MS } from "../../lib/external/overpass";
import { type GovEntry, isOsmFuel, mergeStations, type OsmEntry, washPlaces } from "../../lib/external/places";
import type { Viewer } from "../../lib/session";

/** Ce que la route donne au service : la case de 0,1° (jamais la position reçue), ou le choix « ville » / « sortie ». */
export type PracticalTarget =
  | { near: "position"; cell: WeatherCell }
  | { near: "city" }
  | { near: "outing"; eventId?: string };

type OutingEvent = { id: string; title: string; lat: number | null; lng: number | null; startsMs: number };

/** Au-delà, la source ne sert plus sa liste périmée (Overpass : 30 jours dans `overpass.ts`, stations : `FUEL_MAX_STALE_MS`). */
const STALE_LIMIT_MS = { osm: WASH_MAX_STALE_MS, fuel: FUEL_MAX_STALE_MS } as const;

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
    // `null` : la source n'a pas répondu dans le budget (le chargement continue) ; le cache toléré sert alors de repli.
    const loads = departments.map(async (d) => {
      const [osm, gov] = await Promise.all([
        withinBudget(osmState(d), null, budgetMs),
        withinBudget(fuelState(d), null, budgetMs),
      ]);
      return { d, osm, gov };
    });
    const listed = await Promise.all(loads);
    const keys = departments.flatMap((d) => [`osm:${d}`, `fuel:${d}`, `wash:${d}`]);
    const rows = await db
      .select({ key: externalCache.key, fetchedAt: externalCache.fetchedAt, data: externalCache.data })
      .from(externalCache)
      .where(inArray(externalCache.key, keys));
    const t = now().getTime();
    const rowOf = new Map(rows.map((r) => [r.key, r]));
    /** La ligne du cache d'une clé si elle n'est pas trop vieille, avec son âge. */
    const tolerated = (key: string, limitMs: number) => {
      const r = rowOf.get(key);
      const age = r ? t - r.fetchedAt.getTime() : Number.POSITIVE_INFINITY;
      return r && age < limitMs ? { data: r.data, age } : null;
    };
    let partial = false;
    const osm: OsmEntry[] = [];
    const gov: GovEntry[] = [];
    for (const l of listed) {
      // OpenStreetMap. Source lente ou muette : réponse partielle (l'écran relit plus tard). Un cache toléré de la même forme (`osm:`,
      // 30 jours au plus) est complet ; seul le repli sur l'ancienne ligne `wash:` (sans les stations) est incomplet, donc partiel.
      let osmList: OsmEntry[] | null = l.osm?.data ?? null;
      if (l.osm === null) {
        partial = true;
        osmList = (tolerated(`osm:${l.d}`, STALE_LIMIT_MS.osm)?.data as OsmEntry[] | undefined) ?? null;
      } else if (l.osm.data === null) partial = true;
      osm.push(...(osmList ?? []));
      // Ancienne ligne `wash:` (lavages seulement) : un complément en lecture seule, tant que la nouvelle n'est pas là ou qu'elle date
      // de moins d'une semaine (au-delà, la nouvelle ligne `osm:` fait foi).
      const legacy = tolerated(`wash:${l.d}`, STALE_LIMIT_MS.osm);
      if (legacy && (legacy.age < WASH_TTL_MS || osmList === null || !l.osm?.fresh)) {
        osm.push(...(legacy.data as OsmEntry[]).filter((e) => e.as === undefined));
      }
      // Jeu public. Muet, lent : partiel. Un ancien cache servi (moins de 7 jours) ne rend pas la réponse partielle.
      let govList: GovEntry[] | null = l.gov?.data ?? null;
      if (l.gov === null) {
        partial = true;
        govList = (tolerated(`fuel:${l.d}`, STALE_LIMIT_MS.fuel)?.data as GovEntry[] | undefined) ?? null;
      } else if (l.gov.data === null) partial = true;
      gov.push(...(govList ?? []));
    }
    // Tous les rapprochements se font ICI, sur les listes de tous les départements réunis (pas par département) et sur les lieux de la
    // zone seulement : deux points voisins de part et d'autre d'une limite départementale se rapprochent comme les autres.
    const near = <T extends Place>(list: readonly T[]) =>
      list.filter((p) => distanceKm(origin, p) <= PRACTICAL_RADIUS_KM + 2);
    const nearOsm = near(osm);
    const merged = mergeStations(near(gov), nearOsm.filter(isOsmFuel));
    const washes = washPlaces(nearOsm, merged.groups);
    // Liste blanche : ni prix, ni heure de mise à jour, ni référence ne sortent d'ici.
    const place = (kind: PracticalKind, p: Place): PracticalPlace => ({
      id: practicalPlaceId(kind, p.lat, p.lng),
      kind,
      name: p.name,
      address: p.address,
      lat: p.lat,
      lng: p.lng,
    });
    const sources = new Map<string, { gov: boolean; osm: boolean }>();
    const fuels = merged.stations.map((st) => {
      const fuel = place("fuel", st);
      sources.set(fuel.id, { gov: st.fromGov, osm: st.fromOsm });
      return fuel;
    });
    const all: PracticalPlace[] = [...washes.map((p) => place("wash", p)), ...fuels];
    const places = placesAround(all, origin);
    // Les deux sources sont citées quand les deux ont servi une station de la réponse.
    const served = places.filter((p) => p.kind === "fuel").map((p) => sources.get(p.id));
    const usedGov = served.some((x) => x?.gov);
    const usedOsm = served.some((x) => x?.osm);
    return {
      places,
      partial,
      attribution: { wash: homeLabels.washAttribution, fuel: fuelAttribution(usedGov || !usedOsm, usedOsm) },
    };
  },
};
