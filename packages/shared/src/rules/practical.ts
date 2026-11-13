// Lot R8q : règles pures de « Pratique » (maquette R8.12) : la station-service et le lavage les plus proches, de moi ou d'une
// sortie. Aucune règle ici ne lit l'heure. La position d'une personne n'est jamais une donnée du serveur : l'API ne connaît
// que la case de 0,1° (`weatherCell`), le téléphone calcule les distances avec sa position exacte, qui ne le quitte pas.
import { BOUNDS_MARGIN_KM, departmentBounds } from "../departmentBounds";
import { departmentCentroids, distanceKm, type LatLng, nearestDepartment } from "../geo";
import { NBSP } from "../labels/units.fr";

/** Les deux sortes de lieu : station-service (`fuel`) et lavage (`wash`). */
export const practicalKinds = ["fuel", "wash"] as const;
export type PracticalKind = (typeof practicalKinds)[number];

/** Rayon autour de l'origine, et nombre de lieux au plus servis par l'API. */
export const PRACTICAL_RADIUS_KM = 30;
export const PRACTICAL_MAX = 200;
/** Les départements dont on lit les lieux : les deux dont le centre est le plus proche de l'origine. */
export const PRACTICAL_DEPARTMENTS = 2;

/** Plafond du nombre de départements lus pour une demande. */
export const PRACTICAL_DEPARTMENTS_MAX = 12;

/**
 * Petit lot de fin D : deux points à moins de cette distance (en mètres) sont le même lieu. Le jeu public des prix et
 * OpenStreetMap placent une même station à quelques dizaines de mètres l'une de l'autre (pompe, caisse, centre du bâtiment) ;
 * deux stations distinctes sont presque toujours à plus de 100 m l'une de l'autre.
 */
export const PRACTICAL_SAME_PLACE_M = 60;

/**
 * Les éléments de `extra` qui n'ont pas de jumeau dans `primary` (à `maxM` mètres au plus). Un jumeau est pris une seule fois :
 * on apparie d'abord les paires les plus proches, de sorte que deux stations voisines gardent chacune la leur. Ordre de `extra` conservé.
 * `canPair` : une paire à la bonne distance peut être refusée (deux stations qui ont chacune leur identifiant ne sont pas jumelles).
 */
export function withoutTwins<T extends LatLng, U extends LatLng>(
  primary: readonly T[],
  extra: readonly U[],
  maxM = PRACTICAL_SAME_PLACE_M,
  canPair: (p: T, e: U) => boolean = () => true,
): U[] {
  // Garde-fou rapide avant le calcul exact : 60 m font moins de 0,0012° de latitude ou de longitude jusqu'à 60° de latitude.
  const box = (maxM / 1000 / 111.2) * 2.2;
  const pairs: { p: number; e: number; m: number }[] = [];
  extra.forEach((e, ei) => {
    primary.forEach((p, pi) => {
      if (Math.abs(p.lat - e.lat) > box || Math.abs(p.lng - e.lng) > box) return;
      if (!canPair(p, e)) return;
      const m = distanceKm(p, e) * 1000;
      if (m <= maxM) pairs.push({ p: pi, e: ei, m });
    });
  });
  pairs.sort((a, b) => a.m - b.m || a.p - b.p || a.e - b.e);
  const usedPrimary = new Set<number>();
  const twinned = new Set<number>();
  for (const pair of pairs) {
    if (usedPrimary.has(pair.p) || twinned.has(pair.e)) continue;
    usedPrimary.add(pair.p);
    twinned.add(pair.e);
  }
  return extra.filter((_, i) => !twinned.has(i));
}

/** Un lieu servi par `POST /practical` : ni prix, ni heure de mise à jour, ni distance. */
export type PracticalPlace = {
  id: string;
  kind: PracticalKind;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
};

/** D'où l'on part : la case de ma position, ma ville, ou l'événement où je vais. */
export type PracticalOrigin = { kind: "cell" | "city" | "outing"; label: string; lat: number; lng: number };

/**
 * `POST /practical`. `partial` : une source n'a rien de servable ou sert une liste incomplète (l'écran relit). `loading` (facultatif, présent
 * seulement quand il est vrai) : un chargement est encore en cours côté API (source lente, le cache se remplit) : relire tant qu'il dure,
 * à la différence d'une source en échec (`partial` sans `loading`). Un client qui ne le connaît pas l'ignore.
 */
export type PracticalData = {
  origin: PracticalOrigin | null;
  places: PracticalPlace[];
  partial: boolean;
  loading?: true;
  /**
   * Petit lot de fin F (mode zone seulement, facultatifs : l'APK en ligne les ignore) : la réponse est **coupée** (plus de 200 lieux dans la
   * zone, ou plus de 12 départements). `coveredKm` : le rayon, autour du centre de la zone, dont tous les lieux sont servis (0 : rien de sûr).
   * L'écran ne marque comme chargé que ce disque, jamais toute la zone.
   */
  truncated?: true;
  coveredKm?: number;
  attribution: { wash: string; fuel: string };
};

export type PracticalPlaceAt = PracticalPlace & { distanceKm: number };

/** Ce que la position donnée à « Pratique » garde EN MÉMOIRE de l'écran : les lieux de sa case et la position exacte (jamais envoyée). */
export type PracticalAt = { exact: LatLng; data: PracticalData };

/** « Près de moi | Près de ma sortie ». */
export type PracticalChoice = "me" | "outing";

/** Relecture d'une réponse partielle (une source n'avait pas répondu dans le budget de l'API) : une seule, après ce délai. */
export const PRACTICAL_PARTIAL_RETRY_MS = 3000;

/** Une empreinte stable (sorte et position) : la même station garde le même identifiant d'un jour à l'autre. */
export function practicalPlaceId(kind: PracticalKind, lat: number, lng: number): string {
  const text = `${kind}:${lat.toFixed(5)},${lng.toFixed(5)}`;
  // cyrb53 : 53 bits, sans dépendance (la clé n'est pas un secret).
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Les `count` départements dont le centre est le plus proche du point (un lieu près d'une limite n'est pas oublié). */
export function nearestDepartments(point: LatLng, count = PRACTICAL_DEPARTMENTS): string[] {
  return Object.entries(departmentCentroids)
    .map(([code, centre]) => ({ code, km: distanceKm(point, centre) }))
    .sort((a, b) => a.km - b.km || a.code.localeCompare(b.code))
    .slice(0, count)
    .map((d) => d.code);
}

/**
 * Les départements qui coupent la zone recherchée : un département est lu si son emprise (rectangle lat/lng, `departmentBounds`, plus
 * `BOUNDS_MARGIN_KM`) coupe le carré qui enferme le cercle de `radiusKm` autour du point. Un rectangle contient tout le département :
 * on peut en lire un de trop (une emprise déborde sur un voisin), jamais un de moins. Plafond de `PRACTICAL_DEPARTMENTS_MAX`, les plus
 * proches du point d'abord (distance au rectangle, 0 s'il y est). Un département dont l'emprise contient le point n'est jamais écarté par le plafond.
 */
export function departmentsAround(point: LatLng, radiusKm = PRACTICAL_RADIUS_KM): string[] {
  const kmPerDegLat = 111.2;
  const margin = BOUNDS_MARGIN_KM;
  const reach = radiusKm + margin;
  // Les méridiens se resserrent vers le pôle : le carré est plus large du côté où le cosinus est le plus petit.
  const worstLat = Math.min(89, Math.abs(point.lat) + reach / kmPerDegLat);
  const kmPerDegLng = kmPerDegLat * Math.cos((worstLat * Math.PI) / 180);
  const dLat = reach / kmPerDegLat;
  const dLng = reach / kmPerDegLng;
  const south = point.lat - dLat;
  const north = point.lat + dLat;
  const west = point.lng - dLng;
  const east = point.lng + dLng;
  const marginLat = margin / kmPerDegLat;
  const found: { code: string; km: number }[] = [];
  for (const code of Object.keys(departmentCentroids)) {
    const box = departmentBounds[code];
    if (!box) continue;
    const [bs, bw, bn, be] = box;
    const lngMargin = margin / (kmPerDegLat * Math.max(0.2, Math.cos((((bs + bn) / 2) * Math.PI) / 180)));
    const intersects =
      bs - marginLat <= north && bn + marginLat >= south && bw - lngMargin <= east && be + lngMargin >= west;
    if (!intersects) continue;
    // Distance du point au rectangle (0 s'il y est), pour classer.
    const clampedLat = Math.min(Math.max(point.lat, bs), bn);
    const clampedLng = Math.min(Math.max(point.lng, bw), be);
    found.push({ code, km: distanceKm(point, { lat: clampedLat, lng: clampedLng }) });
  }
  // Aucune emprise ne contient le point (position en mer, imprécision) : le département dont le centre est le plus proche.
  if (!found.some((f) => f.km === 0)) {
    const own = nearestDepartment(point);
    if (own && !found.some((f) => f.code === own)) found.push({ code: own, km: 0 });
  }
  return found
    .sort((x, y) => x.km - y.km || x.code.localeCompare(y.code))
    .slice(0, PRACTICAL_DEPARTMENTS_MAX)
    .map((f) => f.code)
    .sort();
}

/** Les lieux à `radiusKm` de l'origine au plus, les `max` plus proches (sans doublon d'identifiant). */
export function placesAround<T extends { id: string; lat: number; lng: number }>(
  places: readonly T[],
  origin: LatLng,
  radiusKm = PRACTICAL_RADIUS_KM,
  max = PRACTICAL_MAX,
): T[] {
  const seen = new Set<string>();
  const kept: { place: T; km: number }[] = [];
  for (const place of places) {
    if (seen.has(place.id)) continue;
    const km = distanceKm(origin, place);
    if (km > radiusKm) continue;
    seen.add(place.id);
    kept.push({ place, km });
  }
  return kept
    .sort((a, b) => a.km - b.km || a.place.id.localeCompare(b.place.id))
    .slice(0, max)
    .map((k) => k.place);
}

/**
 * Comme `placesAround`, avec la coupe (petit lot de fin F, tour 2) : `cut` quand plus de `max` lieux étaient dans le rayon ; `coveredKm` est
 * alors la distance du dernier lieu gardé (tout lieu plus proche est servi), sans dépasser `radiusKm`.
 */
export function placesAroundInfo<T extends { id: string; lat: number; lng: number }>(
  places: readonly T[],
  origin: LatLng,
  radiusKm = PRACTICAL_RADIUS_KM,
  max = PRACTICAL_MAX,
): { places: T[]; cut: boolean; coveredKm: number } {
  const all = placesAround(places, origin, radiusKm, Number.POSITIVE_INFINITY);
  if (all.length <= max) return { places: all, cut: false, coveredKm: radiusKm };
  const kept = all.slice(0, max);
  const last = kept[kept.length - 1];
  const reach = last ? distanceKm(origin, last) : 0;
  return { places: kept, cut: true, coveredKm: Math.max(0, Math.min(reach - 0.05, radiusKm)) };
}

const tenth = (n: number) => Math.round(n * 10) / 10;

/** Les lieux avec leur distance à `from`, du plus proche au plus éloigné : le tri se fait sur la distance exacte, l'arrondi (au dixième de km) n'est que pour l'affichage. */
export function withDistance(places: readonly PracticalPlace[], from: LatLng): PracticalPlaceAt[] {
  return places
    .map((p) => ({ place: p, exact: distanceKm(from, p) }))
    .sort((a, b) => a.exact - b.exact || a.place.id.localeCompare(b.place.id))
    .map(({ place, exact }) => ({ ...place, distanceKm: tenth(exact) }));
}

/** La plus proche de chaque sorte (station-service d'abord, lavage ensuite), `null` quand il n'y en a pas. */
export function nearestOfEach(
  places: readonly PracticalPlace[],
  from: LatLng,
): Record<PracticalKind, PracticalPlaceAt | null> {
  const sorted = withDistance(places, from);
  return {
    fuel: sorted.find((p) => p.kind === "fuel") ?? null,
    wash: sorted.find((p) => p.kind === "wash") ?? null,
  };
}

/** Le filtre « Tout · Stations-service · Lavage ». */
export type PracticalFilter = "all" | PracticalKind;
export function filterKind<T extends { kind: PracticalKind }>(places: readonly T[], filter: PracticalFilter): T[] {
  return filter === "all" ? [...places] : places.filter((p) => p.kind === filter);
}

/**
 * Le titre d'un lieu. Lavage : son nom OpenStreetMap, à défaut « Station de lavage ». Station-service : son nom quand
 * OpenStreetMap en donne un (petit lot de fin D), sinon la rue de son adresse (le jeu public des prix n'a pas de nom de station),
 * sans le numéro, à défaut « Station-service ».
 */
export function practicalTitle(
  place: Pick<PracticalPlace, "kind" | "name" | "address">,
  unnamed: Record<PracticalKind, string>,
): string {
  if (place.kind === "wash") return place.name.trim() || unnamed.wash;
  const named = place.name.replace(/\s+/g, " ").trim();
  if (named && named !== unnamed.fuel) return named;
  const street = (place.address ?? "").split(",")[0]?.replace(/\s+/g, " ").trim() ?? "";
  // Pas de rue (l'adresse commence par le code postal) : le titre par défaut.
  if (/^\d{5}\b/.test(street)) return unnamed.fuel;
  const withoutNumber = street.replace(/^\d{1,4}\s*(?:bis|ter|quater|[a-d])?\b[\s,.-]*/i, "").trim();
  if (!withoutNumber) return unnamed.fuel;
  return withoutNumber.charAt(0).toUpperCase() + withoutNumber.slice(1);
}

/** « 0,8 km », « 12 km » : un décimal sous 10 km, entier au-delà ; l'espace est insécable (le nombre et l'unité ne se séparent pas). */
export function formatKm(km: number): string {
  const text = km < 10 ? tenth(km).toFixed(1).replace(".", ",") : String(Math.round(km));
  return `${text}${NBSP}km`;
}
