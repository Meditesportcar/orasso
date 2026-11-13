// Petit lot de fin D, tour 1 : les règles PURES qui rapprochent les stations de deux sources (le jeu public des prix, OpenStreetMap)
// et les lavages des stations avec lavage. Elles travaillent sur des listes DÉJÀ agrégées sur tous les départements de la zone :
// deux représentations d'un même lieu de part et d'autre d'une limite départementale se rapprochent comme les autres.
import { type CachedPlace, distanceKm, homeLabels, PRACTICAL_SAME_PLACE_M, withoutTwins } from "@orasso/shared";

/**
 * Un lieu d'OpenStreetMap. Sans `as` : un lavage (`amenity=car_wash`). `as: "fuel"` : une station-service sans lavage ; `"both"` : une
 * station-service avec lavage (`car_wash=yes`). `ref` : `ref:FR:prix-carburants`, l'identifiant de la station dans le jeu public.
 */
export type OsmEntry = CachedPlace & { as?: "fuel" | "both"; ref?: string };
/** Une station du jeu public ; `ref` : son identifiant (absent d'un ancien cache). */
export type GovEntry = CachedPlace & { ref?: string };

/** Deux objets d'OpenStreetMap à moins de cette distance, dont l'un sans nom, sont une même station (nœud et auvent). */
export const OSM_GROUP_M = 35;

const isGeneric = (p: CachedPlace) => !p.name.trim() || p.name === homeLabels.fuelUnnamed;
const meters = (a: CachedPlace, b: CachedPlace) => distanceKm(a, b) * 1000;
export const isOsmWash = (p: OsmEntry) => p.as !== "fuel";
export const isOsmFuel = (p: OsmEntry) => p.as === "fuel" || p.as === "both";

/**
 * Regroupe les stations d'OpenStreetMap entre elles : la même référence, ou à `OSM_GROUP_M` mètres dont l'un sans nom. Deux objets
 * de références différentes ne sont jamais regroupés. Le groupe prend la position et le nom du meilleur membre (une référence
 * d'abord, puis un nom), l'adresse du premier qui en a une, et `as: "both"` si l'un des membres a un lavage.
 */
export function groupOsmStations(list: readonly OsmEntry[]): OsmEntry[] {
  const parent = list.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r] as number;
    let c = i;
    while (parent[c] !== r) {
      const next = parent[c] as number;
      parent[c] = r;
      c = next;
    }
    return r;
  };
  // Ce que chaque groupe porte : sa référence (au plus une) et ses noms. On ne joint JAMAIS deux groupes de références différentes, ni
  // deux groupes dont les noms n'ont rien en commun : un objet sans nom ne relie pas deux stations (il rejoint la plus proche).
  const refOf = new Map<number, string | undefined>();
  const namesOf = new Map<number, Set<string>>();
  list.forEach((e, i) => {
    refOf.set(i, e.ref || undefined);
    namesOf.set(i, new Set(isGeneric(e) ? [] : [e.name.trim().toLowerCase()]));
  });
  const join = (i: number, j: number, byRef: boolean) => {
    const ri = find(i);
    const rj = find(j);
    if (ri === rj) return;
    const refI = refOf.get(ri);
    const refJ = refOf.get(rj);
    if (refI && refJ && refI !== refJ) return;
    const namesI = namesOf.get(ri) as Set<string>;
    const namesJ = namesOf.get(rj) as Set<string>;
    if (!byRef && namesI.size > 0 && namesJ.size > 0 && ![...namesI].some((n) => namesJ.has(n))) return;
    parent[rj] = ri;
    refOf.set(ri, refI ?? refJ);
    for (const n of namesJ) namesI.add(n);
  };
  // (1) la même référence : la même station ; (2) puis les objets proches dont l'un est sans nom, du plus proche au plus loin.
  const near: { i: number; j: number; m: number }[] = [];
  const box = (OSM_GROUP_M / 1000 / 111.2) * 2.2;
  for (let i = 0; i < list.length; i++) {
    const a = list[i] as OsmEntry;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j] as OsmEntry;
      if (a.ref && a.ref === b.ref) {
        join(i, j, true);
        continue;
      }
      if (a.ref && b.ref) continue;
      if (!(isGeneric(a) || isGeneric(b))) continue;
      if (Math.abs(a.lat - b.lat) > box || Math.abs(a.lng - b.lng) > box) continue;
      const m = meters(a, b);
      if (m <= OSM_GROUP_M) near.push({ i, j, m });
    }
  }
  near.sort((x, y) => x.m - y.m || x.i - y.i || x.j - y.j);
  for (const { i, j } of near) join(i, j, false);
  const groups = new Map<number, OsmEntry[]>();
  list.forEach((p, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), p]);
  });
  const score = (p: OsmEntry) => (p.ref ? 2 : 0) + (isGeneric(p) ? 0 : 1);
  return [...groups.values()].map((members) => {
    const best = [...members].sort((a, b) => score(b) - score(a))[0] as OsmEntry;
    const ref = members.find((m) => m.ref)?.ref;
    return {
      name: isGeneric(best) ? (members.find((m) => !isGeneric(m))?.name ?? best.name) : best.name,
      address: best.address ?? members.find((m) => m.address)?.address ?? null,
      lat: best.lat,
      lng: best.lng,
      as: members.some((m) => m.as === "both") ? ("both" as const) : ("fuel" as const),
      ...(ref ? { ref } : {}),
    };
  });
}

/** Une station à servir : d'où elle vient (le jeu public et/ou OpenStreetMap, pour les sources à citer). */
export type MergedStation = CachedPlace & { fromGov: boolean; fromOsm: boolean };

/**
 * Les stations des deux sources. Ordre : (1) par la référence (`ref` d'OpenStreetMap = `ref` du jeu public) : même station quelle que
 * soit la distance, et SEULEMENT dans ce cas la station du jeu public prend le nom d'OpenStreetMap (par la distance seule, deux
 * stations publiques à 42 m l'une de l'autre donneraient la mauvaise marque) ; (2) les objets d'OpenStreetMap restés sans jumelle par
 * référence se rapprochent d'une station du jeu public à `PRACTICAL_SAME_PLACE_M` mètres au plus, sans nom donné, et jamais si les deux
 * ont chacun une référence (ce sont deux stations) ; (3) ce qui reste d'OpenStreetMap s'ajoute. Le jeu public garde id, position, adresse.
 * Renvoie aussi les stations d'OpenStreetMap regroupées (pour les lavages de station).
 */
export function mergeStations(
  gov: readonly GovEntry[],
  osmFuel: readonly OsmEntry[],
): { stations: MergedStation[]; groups: OsmEntry[] } {
  const groups = groupOsmStations(osmFuel);
  const govByRef = new Map<string, number>();
  gov.forEach((g, i) => {
    if (g.ref) govByRef.set(g.ref, i);
  });
  const names = new Map<number, string>();
  const rest: OsmEntry[] = [];
  for (const group of groups) {
    const i = group.ref ? govByRef.get(group.ref) : undefined;
    if (i === undefined) {
      rest.push(group);
      continue;
    }
    // Rapprochée par la référence : le jeu public garde ses données, et prend le nom d'OpenStreetMap s'il en donne un.
    names.set(i, isGeneric(group) ? "" : group.name);
  }
  const unpaired = gov.filter((_, i) => !names.has(i));
  const added = withoutTwins(unpaired, rest, PRACTICAL_SAME_PLACE_M, (g, o) => !(g.ref && o.ref));
  const stations: MergedStation[] = [
    ...gov.map((g, i) => {
      const named = names.get(i);
      return {
        name: named ? named : g.name,
        address: g.address,
        lat: g.lat,
        lng: g.lng,
        fromGov: true,
        fromOsm: Boolean(named),
      };
    }),
    ...added.map((o) => ({ name: o.name, address: o.address, lat: o.lat, lng: o.lng, fromGov: false, fromOsm: true })),
  ];
  return { stations, groups };
}

/**
 * Les lavages : les `amenity=car_wash` et les stations avec lavage (`as: "both"`, déjà regroupées), sauf une station qui a un lavage
 * cartographié à `PRACTICAL_SAME_PLACE_M` mètres au plus (c'est le même lieu). Station sans nom : « Station de lavage ».
 */
export function washPlaces(entries: readonly OsmEntry[], groups: readonly OsmEntry[]): CachedPlace[] {
  const standalone = entries.filter((e) => e.as === undefined);
  const withWash = groups.filter((g) => g.as === "both");
  const stationWashes = withoutTwins(standalone, withWash).map((g) => ({
    ...g,
    name: isGeneric(g) ? homeLabels.washUnnamed : g.name,
  }));
  return [...standalone, ...stationWashes].map(({ name, address, lat, lng }) => ({ name, address, lat, lng }));
}
