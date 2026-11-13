// Petit lot de fin, partie F : « Pratique » suit la zone de la carte (maquette du 13/11, option C « Hybride »). Règles pures, communes à
// l'API, au site et à l'appli : la zone (quatre bords) arrondie vers l'extérieur au 0,1°, sa taille (60 km de côté au plus), la zone
// demandée (élargie d'une demi-zone de chaque côté), les départements qui la coupent, ce qui est déjà chargé (disques et carrés),
// le filtre par texte. Aucune règle ici ne lit l'heure. La position d'une personne n'en fait jamais partie : seule la zone regardée
// part au serveur ; les distances se calculent sur le téléphone.
import { BOUNDS_MARGIN_KM, departmentBounds } from "../departmentBounds";
import { departmentCentroids, distanceKm, type LatLng, nearestDepartment } from "../geo";
import { PRACTICAL_DEPARTMENTS_MAX, PRACTICAL_MAX, type PracticalKind } from "./practical";

/** Une zone de carte : sud, ouest, nord, est (degrés). */
export type PracticalZone = { south: number; west: number; north: number; east: number };

/** Côté le plus grand d'une zone demandée (après l'arrondi vers l'extérieur) : au-delà, « Zoome sur un secteur pour voir ses lieux. ». */
export const PRACTICAL_ZONE_MAX_KM = 60;
/** Largeur de la carte à l'ouverture (8 km autour de l'origine ; à 30 km tout serait regroupé). */
export const PRACTICAL_OPEN_VIEW_KM = 8;
/** Mémoire de l'écran : au plus ce nombre de lieux gardés pendant une séance (jamais écrits sur le téléphone). */
export const PRACTICAL_STORE_MAX = 4000;

const KM_PER_DEG = 111.2;
const EPS = 1e-9;

/** Les bords d'une zone sont des multiples de 0,1° : le dixième de degré exact (entier), sans dérive de virgule flottante. */
const cellDown = (n: number) => Math.floor(n * 10 + EPS);
const cellUp = (n: number) => Math.ceil(n * 10 - EPS);

/** La zone arrondie vers l'extérieur au 0,1° (le sud et l'ouest vers le bas, le nord et l'est vers le haut). */
export function roundZoneOutward(z: PracticalZone): PracticalZone {
  return {
    south: cellDown(z.south) / 10,
    west: cellDown(z.west) / 10,
    north: cellUp(z.north) / 10,
    east: cellUp(z.east) / 10,
  };
}

/** Largeur (à la latitude médiane) et hauteur de la zone, en km. */
export function zoneSizeKm(z: PracticalZone): { width: number; height: number } {
  const mid = (z.south + z.north) / 2;
  return {
    width: (z.east - z.west) * KM_PER_DEG * Math.cos((mid * Math.PI) / 180),
    height: (z.north - z.south) * KM_PER_DEG,
  };
}

/** Nombre de cases de 0,1° au plus, dans chaque sens, pour une zone de 60 km au plus à cette latitude médiane. */
function maxCells(midLat: number): { lat: number; lng: number } {
  const cosLat = Math.max(0.05, Math.cos((midLat * Math.PI) / 180));
  return {
    lat: Math.floor(PRACTICAL_ZONE_MAX_KM / (0.1 * KM_PER_DEG) + EPS),
    lng: Math.floor(PRACTICAL_ZONE_MAX_KM / (0.1 * KM_PER_DEG * cosLat) + EPS),
  };
}

/** Une zone est-elle plus grande que 60 km (une fois arrondie vers l'extérieur) ? Alors l'API la refuse et l'écran demande de zoomer. */
export function zoneTooBig(z: PracticalZone): boolean {
  const r = roundZoneOutward(z);
  const max = maxCells((r.south + r.north) / 2);
  return cellUp(r.north) - cellDown(r.south) > max.lat || cellUp(r.east) - cellDown(r.west) > max.lng;
}

/** Une zone au sens large : quatre nombres finis, le sud sous le nord et l'ouest à l'ouest de l'est, dans les limites du globe. */
export function zoneIsWellFormed(z: PracticalZone): boolean {
  const all = [z.south, z.west, z.north, z.east];
  return (
    all.every((n) => Number.isFinite(n)) &&
    z.south < z.north &&
    z.west < z.east &&
    z.south >= -90 &&
    z.north <= 90 &&
    z.west >= -180 &&
    z.east <= 180
  );
}

export const zoneCenter = (z: PracticalZone): LatLng => ({ lat: (z.south + z.north) / 2, lng: (z.west + z.east) / 2 });

/**
 * La zone que l'écran demande à l'appui de « Rechercher dans cette zone » : la zone regardée (arrondie vers l'extérieur) élargie d'une
 * demi-zone de chaque côté, sans dépasser 60 km, pour que les gestes suivants restent sur le téléphone. Toujours dans les limites
 * acceptées par l'API (`zoneTooBig` faux). La zone regardée doit elle-même tenir dans 60 km (sinon aucune demande ne part).
 */
export function zoneForRequest(view: PracticalZone): PracticalZone {
  const r = roundZoneOutward(view);
  let south = cellDown(r.south);
  let north = cellUp(r.north);
  let west = cellDown(r.west);
  let east = cellUp(r.east);
  const max = maxCells((r.south + r.north) / 2);
  const grow = (low: number, high: number, limit: number): [number, number] => {
    const size = high - low;
    const extra = Math.min(Math.ceil(size / 2), Math.max(0, Math.floor((limit - size) / 2)));
    return [low - extra, high + extra];
  };
  [south, north] = grow(south, north, max.lat);
  [west, east] = grow(west, east, max.lng);
  return { south: south / 10, west: west / 10, north: north / 10, east: east / 10 };
}

export const zoneContains = (z: PracticalZone, p: LatLng, padLat = 0, padLng = 0): boolean =>
  p.lat <= z.north + padLat && p.lat >= z.south - padLat && p.lng >= z.west - padLng && p.lng <= z.east + padLng;

/**
 * Les départements qui coupent la zone (emprise du département, avec sa marge, voir `departmentsAround`), `PRACTICAL_DEPARTMENTS_MAX`
 * au plus, les plus proches du centre d'abord. Un département peut être lu en trop, jamais en moins.
 */
export function departmentsInZone(z: PracticalZone): string[] {
  const margin = BOUNDS_MARGIN_KM;
  const marginLat = margin / KM_PER_DEG;
  const centre = zoneCenter(z);
  const found: { code: string; km: number }[] = [];
  for (const code of Object.keys(departmentCentroids)) {
    const box = departmentBounds[code];
    if (!box) continue;
    const [bs, bw, bn, be] = box;
    const lngMargin = margin / (KM_PER_DEG * Math.max(0.2, Math.cos((((bs + bn) / 2) * Math.PI) / 180)));
    if (bs - marginLat > z.north || bn + marginLat < z.south || bw - lngMargin > z.east || be + lngMargin < z.west) continue;
    const clamped = { lat: Math.min(Math.max(centre.lat, bs), bn), lng: Math.min(Math.max(centre.lng, bw), be) };
    found.push({ code, km: distanceKm(centre, clamped) });
  }
  // Aucune emprise ne coupe la zone (en mer, imprécision) : le département dont le centre est le plus proche du centre de la zone.
  if (found.length === 0) {
    const own = nearestDepartment(centre);
    if (own) found.push({ code: own, km: 0 });
  }
  return found
    .sort((a, b) => a.km - b.km || a.code.localeCompare(b.code))
    .slice(0, PRACTICAL_DEPARTMENTS_MAX)
    .map((f) => f.code)
    .sort();
}

/** Les lieux dans la zone (sans doublon d'identifiant), les `max` plus proches du centre de la zone. */
export function placesInZone<T extends { id: string; lat: number; lng: number }>(
  places: readonly T[],
  z: PracticalZone,
  max = PRACTICAL_MAX,
): T[] {
  const centre = zoneCenter(z);
  const seen = new Set<string>();
  const kept: { place: T; km: number }[] = [];
  for (const place of places) {
    if (seen.has(place.id) || !zoneContains(z, place)) continue;
    seen.add(place.id);
    kept.push({ place, km: distanceKm(centre, place) });
  }
  return kept
    .sort((a, b) => a.km - b.km || a.place.id.localeCompare(b.place.id))
    .slice(0, max)
    .map((k) => k.place);
}

/** Ce que l'écran a déjà chargé : un disque (la lecture d'ouverture, 30 km autour de l'origine) ou un carré (une zone demandée). */
export type ZoneCover = ({ t: "disk"; km: number } & LatLng) | { t: "rect"; zone: PracticalZone };

export const coverContains = (cover: readonly ZoneCover[], p: LatLng): boolean =>
  cover.some((c) => (c.t === "disk" ? distanceKm(c, p) <= c.km : zoneContains(c.zone, p)));

/** Toute la zone regardée est-elle dans ce qui est chargé ? (25 points de contrôle, bords compris, comme la maquette.) */
export function viewCovered(cover: readonly ZoneCover[], view: PracticalZone): boolean {
  for (let i = 0; i <= 4; i++) {
    for (let j = 0; j <= 4; j++) {
      const p = {
        lat: view.south + ((view.north - view.south) * i) / 4,
        lng: view.west + ((view.east - view.west) * j) / 4,
      };
      if (!coverContains(cover, p)) return false;
    }
  }
  return true;
}

/** Le voile de la carte : les rectangles de la zone regardée (agrandie de `pad`) qui ne sont pas chargés, en bandes de cases de 0,05°. */
export function unloadedBands(cover: readonly ZoneCover[], view: PracticalZone, pad = 0.2, step = 0.05): PracticalZone[] {
  const south = Math.floor((view.south - pad) / step) * step;
  const north = Math.ceil((view.north + pad) / step) * step;
  const west = Math.floor((view.west - pad) / step) * step;
  const east = Math.ceil((view.east + pad) / step) * step;
  const bands: PracticalZone[] = [];
  const rows = Math.min(400, Math.round((north - south) / step));
  const cols = Math.min(400, Math.round((east - west) / step));
  for (let r = 0; r < rows; r++) {
    const s = south + r * step;
    let start: number | null = null;
    for (let c = 0; c <= cols; c++) {
      const w = west + c * step;
      const open = c < cols && !coverContains(cover, { lat: s + step / 2, lng: w + step / 2 });
      if (open && start === null) start = c;
      if (!open && start !== null) {
        bands.push({ south: s, north: s + step, west: west + start * step, east: w });
        start = null;
      }
    }
  }
  return bands;
}

/* ---------- Recherche par texte (sur le téléphone) ---------- */

/** Sans accents ni majuscules : « Argelès » et « argeles » se valent. */
export const normalizeSearch = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Le titre d'un lieu contient-il le texte cherché ? (Le texte vide convient à tous.) */
export const matchesSearch = (title: string, text: string): boolean => {
  const q = normalizeSearch(text);
  return !q || normalizeSearch(title).includes(q);
};

/** « Argelès-sur-Mer (66) » → « Argelès-sur-Mer » : le nom d'une commune proposée par `GET /geo/cities`. */
export const cityNameOf = (label: string): string => label.replace(/\s*\(\d{2,3}[AB]?\)\s*$/, "").trim();

/** « de », « du », « des » ou « d' » devant un nom de lieu : « Autour d'Argelès… », « du Boulou ». */
export function elide(name: string): string {
  if (/^Le\s/.test(name)) return `du ${name.slice(3)}`;
  if (/^Les\s/.test(name)) return `des ${name.slice(4)}`;
  if (/^[AEIOUYÉÈÊHaeiouyéèêh]/.test(name)) return `d'${name}`;
  return `de ${name}`;
}

/** La zone d'une carte de `km` kilomètres de large autour d'un point (téléphone : largeur de la carte ; la hauteur suit son format). */
export function zoneAround(p: LatLng, widthKm: number, heightKm = widthKm): PracticalZone {
  const dLat = heightKm / 2 / KM_PER_DEG;
  const dLng = widthKm / 2 / (KM_PER_DEG * Math.max(0.05, Math.cos((p.lat * Math.PI) / 180)));
  return { south: p.lat - dLat, north: p.lat + dLat, west: p.lng - dLng, east: p.lng + dLng };
}

/** Ce que l'écran garde en mémoire (jamais écrit) : les lieux reçus, sans doublon, `PRACTICAL_STORE_MAX` au plus (les plus anciens sortent). */
export function mergeStore<T extends { id: string }>(store: ReadonlyMap<string, T>, incoming: readonly T[]): Map<string, T> {
  const next = new Map(store);
  for (const p of incoming) {
    next.delete(p.id);
    next.set(p.id, p);
  }
  while (next.size > PRACTICAL_STORE_MAX) {
    const oldest = next.keys().next().value;
    if (oldest === undefined) break;
    next.delete(oldest);
  }
  return next;
}

/** Les compteurs « N stations · N lavages dans la zone » : la sorte de chaque lieu. */
export function countByKind(places: readonly { kind: PracticalKind }[]): { fuel: number; wash: number } {
  let fuel = 0;
  for (const p of places) if (p.kind === "fuel") fuel += 1;
  return { fuel, wash: places.length - fuel };
}
