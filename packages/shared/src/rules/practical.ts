// Lot R8q : règles pures de « Pratique » (maquette R8.12) : la station-service et le lavage les plus proches, de moi ou d'une
// sortie. Aucune règle ici ne lit l'heure. La position d'une personne n'est jamais une donnée du serveur : l'API ne connaît
// que la case de 0,1° (`weatherCell`), le téléphone calcule les distances avec sa position exacte, qui ne le quitte pas.
import { departmentCentroids, distanceKm, type LatLng } from "../geo";
import { NBSP } from "../labels/units.fr";

/** Les deux sortes de lieu : station-service (`fuel`) et lavage (`wash`). */
export const practicalKinds = ["fuel", "wash"] as const;
export type PracticalKind = (typeof practicalKinds)[number];

/** Rayon autour de l'origine, et nombre de lieux au plus servis par l'API. */
export const PRACTICAL_RADIUS_KM = 30;
export const PRACTICAL_MAX = 200;
/** Les départements dont on lit les lieux : les deux dont le centre est le plus proche de l'origine. */
export const PRACTICAL_DEPARTMENTS = 2;

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

/** `POST /practical`. `partial` : une source n'a pas répondu dans le budget (l'écran relit une fois après 3 secondes). */
export type PracticalData = {
  origin: PracticalOrigin | null;
  places: PracticalPlace[];
  partial: boolean;
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

const tenth = (n: number) => Math.round(n * 10) / 10;

/** Les lieux avec leur distance à `from` (arrondie au dixième de km), du plus proche au plus éloigné. */
export function withDistance(places: readonly PracticalPlace[], from: LatLng): PracticalPlaceAt[] {
  return places
    .map((p) => ({ ...p, distanceKm: tenth(distanceKm(from, p)) }))
    .sort((a, b) => a.distanceKm - b.distanceKm || a.id.localeCompare(b.id));
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
 * Le titre d'un lieu. Lavage : son nom OpenStreetMap, à défaut « Station de lavage ». Station-service : la rue de son adresse
 * (le jeu public des prix n'a pas de nom de station), sans le numéro, à défaut « Station-service ».
 */
export function practicalTitle(
  place: Pick<PracticalPlace, "kind" | "name" | "address">,
  unnamed: Record<PracticalKind, string>,
): string {
  if (place.kind === "wash") return place.name.trim() || unnamed.wash;
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
