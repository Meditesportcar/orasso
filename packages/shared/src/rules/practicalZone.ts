// Petit lot de fin, partie F : « Pratique » suit la zone de la carte (maquette du 13/11, option C « Hybride »). Règles pures, communes à
// l'API, au site et à l'appli : la zone (quatre bords) arrondie vers l'extérieur au 0,1°, sa taille (60 km de côté au plus), la zone
// demandée (élargie d'une demi-zone de chaque côté), les départements qui la coupent, ce qui est déjà chargé (disques et carrés),
// le filtre par texte. Aucune règle ici ne lit l'heure. La position d'une personne n'en fait jamais partie : seule la zone regardée
// part au serveur ; les distances se calculent sur le téléphone.
import { BOUNDS_MARGIN_KM, departmentBounds } from "../departmentBounds";
import { departmentCentroids, distanceKm, type LatLng, nearestDepartment } from "../geo";
import { departmentPrefectures } from "../prefectures";
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

/**
 * Côté écran : la zone regardée (AVANT tout arrondi) dépasse-t-elle 60 km de côté ? Alors rien ne part et l'écran demande de zoomer
 * (« Zoome sur un secteur pour voir ses lieux. »). Jamais de clignotement sous 60 km : la mesure ne dépend pas du calage sur la grille.
 */
export function zoneTooBig(z: PracticalZone): boolean {
  const size = zoneSizeKm(z);
  // Tolérance de 1 m : un côté de 60 km exactement (calculé en virgule flottante, 60,00000000000032) n'est pas refusé.
  return size.width > PRACTICAL_ZONE_MAX_KM + 0.001 || size.height > PRACTICAL_ZONE_MAX_KM + 0.001;
}

/** Cases de 0,1° acceptées par l'API au-delà du plafond de 60 km : l'arrondi vers l'extérieur et la demi-case de la zone centrée. */
export const PRACTICAL_ZONE_REQUEST_EXTRA_CELLS = 3;

/**
 * Côté API : la zone reçue (arrondie vers l'extérieur) est refusée au-delà de `maxCells + PRACTICAL_ZONE_REQUEST_EXTRA_CELLS` cases par
 * axe, soit 60 km plus l'arrondi : une vue de 60 km au plus, quel que soit son calage, est toujours acceptée.
 */
export function zoneRequestTooBig(z: PracticalZone): boolean {
  const r = roundZoneOutward(z);
  const max = maxCells((r.south + r.north) / 2);
  return (
    cellUp(r.north) - cellDown(r.south) > max.lat + PRACTICAL_ZONE_REQUEST_EXTRA_CELLS ||
    cellUp(r.east) - cellDown(r.west) > max.lng + PRACTICAL_ZONE_REQUEST_EXTRA_CELLS
  );
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

/** Le demi-côté d'une vue, en cases de 0,1° entières (au millième près : la taille ne dépend pas du calage dans la case). */
const halfCells = (spanDegrees: number) =>
  Math.max(1, Math.ceil(Math.round((spanDegrees / 2) * 10 * 1000) / 1000 - 1e-9));

/**
 * La zone que l'écran demande à l'appui de « Rechercher dans cette zone » : **construite depuis la case de 0,1° du centre de la vue**, avec
 * une demi-taille en cases entières, symétrique, puis élargie d'une demi-zone de chaque côté sans dépasser 60 km (une vue dont la zone
 * dépasse ce plafond part sans élargissement). Deux positions de la même case, à la même taille de vue, donnent toujours la même zone :
 * elle ne laisse jamais deviner une position plus finement que la case. Elle contient toujours la vue.
 */
export function zoneForRequest(view: PracticalZone, expand = true): PracticalZone {
  const centre = zoneCenter(view);
  const cLat = cellDown(centre.lat);
  const cLng = cellDown(centre.lng);
  const max = maxCells((cLat + 0.5) / 10);
  const axis = (cell: number, spanDegrees: number, limit: number): [number, number] => {
    // Jamais plus de cases que l'API n'en accepte (60 km plus l'arrondi) : une vue de 60 km à une fraction près ne reçoit pas un refus.
    const h = Math.min(halfCells(spanDegrees), Math.floor((limit + PRACTICAL_ZONE_REQUEST_EXTRA_CELLS - 1) / 2));
    // `expand` faux : une zone déjà coupée (trop de lieux) ne s'élargit plus, elle se resserre sur la vue.
    const grown = expand ? h + Math.ceil((2 * h + 1) / 2) : h;
    const cap = Math.floor((limit - 1) / 2);
    const h2 = grown > cap ? Math.max(h, cap) : grown;
    return [cell - h2, cell + 1 + h2];
  };
  const [south, north] = axis(cLat, view.north - view.south, max.lat);
  const [west, east] = axis(cLng, view.east - view.west, max.lng);
  return { south: south / 10, west: west / 10, north: north / 10, east: east / 10 };
}

export const zoneContains = (z: PracticalZone, p: LatLng, padLat = 0, padLng = 0): boolean =>
  p.lat <= z.north + padLat && p.lat >= z.south - padLat && p.lng >= z.west - padLng && p.lng <= z.east + padLng;

/**
 * Les départements qui coupent la zone (emprise du département, avec sa marge, voir `departmentsAround`), `PRACTICAL_DEPARTMENTS_MAX`
 * au plus, les plus proches du centre d'abord. Un département peut être lu en trop, jamais en moins.
 */
export function departmentsInZone(z: PracticalZone): string[] {
  return departmentsInZoneInfo(z).codes;
}

/** Les départements de la zone, et `cut` : il y en avait plus que `PRACTICAL_DEPARTMENTS_MAX` (la liste est alors incomplète : jamais « en moins » en silence). */
export function departmentsInZoneInfo(z: PracticalZone): { codes: string[]; cut: boolean } {
  const margin = BOUNDS_MARGIN_KM;
  const marginLat = margin / KM_PER_DEG;
  const centre = zoneCenter(z);
  const found: { code: string; km: number }[] = [];
  for (const code of Object.keys(departmentCentroids)) {
    const box = departmentBounds[code];
    if (!box) continue;
    const [bs, bw, bn, be] = box;
    const lngMargin = margin / (KM_PER_DEG * Math.max(0.2, Math.cos((((bs + bn) / 2) * Math.PI) / 180)));
    if (bs - marginLat > z.north || bn + marginLat < z.south || bw - lngMargin > z.east || be + lngMargin < z.west)
      continue;
    const clamped = { lat: Math.min(Math.max(centre.lat, bs), bn), lng: Math.min(Math.max(centre.lng, bw), be) };
    found.push({ code, km: distanceKm(centre, clamped) });
  }
  // Aucune emprise ne coupe la zone (en mer, imprécision) : le département dont le centre est le plus proche du centre de la zone.
  if (found.length === 0) {
    const own = nearestDepartment(centre);
    if (own) found.push({ code: own, km: 0 });
  }
  const sorted = found.sort((a, b) => a.km - b.km || a.code.localeCompare(b.code));
  return {
    codes: sorted
      .slice(0, PRACTICAL_DEPARTMENTS_MAX)
      .map((f) => f.code)
      .sort(),
    cut: sorted.length > PRACTICAL_DEPARTMENTS_MAX,
  };
}

/** Le plus grand cercle centré sur la zone qui tient dans la zone, en km (ce que la zone couvre sûrement autour de son centre). */
export function zoneInscribedKm(z: PracticalZone): number {
  const size = zoneSizeKm(z);
  return Math.min(size.width, size.height) / 2;
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
export type ZoneCover =
  /** Un disque ; `except` : des cases incomplètes d'une lecture plus récente (clés `cellKey`), jamais couvertes par ce disque plus ancien. */
  | ({ t: "disk"; km: number; except?: ReadonlySet<string> } & LatLng)
  /** Un carré ; `except` : des cases de 0,1° (clés `cellKey`) dont tous les lieux n'ont PAS été servis (réponse coupée, répartie par case). */
  | { t: "rect"; zone: PracticalZone; except?: ReadonlySet<string> };

/** La clé de la case de 0,1° d'un point. */
export const cellKey = (p: LatLng): string => `${cellDown(p.lat)},${cellDown(p.lng)}`;

export const coverContains = (cover: readonly ZoneCover[], p: LatLng): boolean =>
  cover.some((c) =>
    c.t === "disk"
      ? distanceKm(c, p) <= c.km && !(c.except && c.except.has(cellKey(p)))
      : zoneContains(c.zone, p) && !(c.except && c.except.has(cellKey(p))),
  );

/**
 * Toute la zone regardée est-elle dans ce qui est chargé ? On contrôle **chaque case de 0,1° traversée par la vue** (neuf points dans
 * l'intersection case ∩ vue : bords et centre, contre toute la couverture) : une case incomplète (`except`) ne passe jamais inaperçue,
 * quelle que soit la taille de la vue. Au plus 60 × 60 cases contrôlées (une vue de 60 km en compte une dizaine).
 */
export function viewCovered(cover: readonly ZoneCover[], view: PracticalZone): boolean {
  const i0 = cellDown(view.south);
  const i1 = Math.min(cellUp(view.north) - 1, i0 + 59);
  const j0 = cellDown(view.west);
  const j1 = Math.min(cellUp(view.east) - 1, j0 + 59);
  const inset = 1e-9;
  for (let i = i0; i <= i1; i++) {
    const south = Math.max(view.south, i / 10);
    const north = Math.min(view.north, (i + 1) / 10);
    if (north <= south) continue;
    for (let j = j0; j <= j1; j++) {
      const west = Math.max(view.west, j / 10);
      const east = Math.min(view.east, (j + 1) / 10);
      if (east <= west) continue;
      const lats = [south + inset, (south + north) / 2, north - inset];
      const lngs = [west + inset, (west + east) / 2, east - inset];
      for (const lat of lats) for (const lng of lngs) if (!coverContains(cover, { lat, lng })) return false;
    }
  }
  return true;
}

/** Le voile de la carte : les rectangles de la zone regardée (agrandie de `pad`) qui ne sont pas chargés, en bandes de cases de 0,05°. */
export function unloadedBands(
  cover: readonly ZoneCover[],
  view: PracticalZone,
  pad = 0.2,
  step = 0.05,
): PracticalZone[] {
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
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Le titre d'un lieu contient-il le texte cherché ? (Le texte vide convient à tous.) */
export const matchesSearch = (title: string, text: string): boolean => {
  const q = normalizeSearch(text);
  return !q || normalizeSearch(title).includes(q);
};

/** « Argelès-sur-Mer (66) » → « Argelès-sur-Mer » : le nom d'une commune proposée par `GET /geo/cities`. */
export const cityNameOf = (label: string): string => label.replace(/\s*\(\d{1,3}[AB]?\)\s*$/, "").trim();

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

/** Remplace dans la mémoire de l'écran les lieux que `gone` désigne par ceux reçus (une réponse complète remplace son emprise). */
export function replaceInStore<T extends { id: string }>(
  store: ReadonlyMap<string, T>,
  gone: (p: T) => boolean,
  incoming: readonly T[],
): Map<string, T> {
  const next = new Map<string, T>();
  for (const [id, p] of store) if (!gone(p)) next.set(id, p);
  return mergeStore(next, incoming);
}

/** Ce que l'écran garde en mémoire (jamais écrit) : les lieux reçus, sans doublon, `PRACTICAL_STORE_MAX` au plus (les plus anciens sortent). */
export function mergeStore<T extends { id: string }>(
  store: ReadonlyMap<string, T>,
  incoming: readonly T[],
): Map<string, T> {
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

/* ---------- Vue de la carte (Web Mercator, tuiles de 512 comme MapLibre) ---------- */

/** Une vue de carte : le centre et le zoom (MapLibre). */
export type MapViewport = LatLng & { zoom: number };

const TILE = 512;
const project = (lat: number, lng: number, zoom: number): [number, number] => {
  const size = TILE * 2 ** zoom;
  const s = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
  return [((lng + 180) / 360) * size, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * size];
};
const unproject = (x: number, y: number, zoom: number): LatLng => {
  const size = TILE * 2 ** zoom;
  return {
    lat: (180 / Math.PI) * Math.atan(Math.sinh(Math.PI - (2 * Math.PI * y) / size)),
    lng: (x / size) * 360 - 180,
  };
};

/** La zone qu'une vue montre sur une carte de `width` × `height` pixels. */
export function viewZone(view: MapViewport, width: number, height: number): PracticalZone {
  const [cx, cy] = project(view.lat, view.lng, view.zoom);
  const nw = unproject(cx - width / 2, cy - height / 2, view.zoom);
  const se = unproject(cx + width / 2, cy + height / 2, view.zoom);
  return { north: nw.lat, west: nw.lng, south: se.lat, east: se.lng };
}

/** Le zoom qui montre `widthKm` de large sur une carte de `width` pixels, à cette latitude. */
export function zoomForWidthKm(lat: number, widthKm: number, width: number): number {
  const metresPerPixelAtZoom0 = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / TILE;
  return Math.log2((metresPerPixelAtZoom0 * width) / (widthKm * 1000));
}

/**
 * La vue qui cadre des points (comme la maquette : `top` px libres en haut pour la plaque du compte, `bottom` en bas pour la carte du lieu,
 * `side` sur les côtés), au zoom `maxZoom` au plus.
 */
export function fitView(
  points: readonly LatLng[],
  width: number,
  height: number,
  opts: { top?: number; bottom?: number; side?: number; maxZoom?: number; minZoom?: number } = {},
): MapViewport {
  const { top = 64, bottom = 104, side = 40, maxZoom = 14.5, minZoom = 7.5 } = opts;
  const first = points[0];
  if (!first) return { lat: 46.6, lng: 2.35, zoom: 5 };
  const b = { n: first.lat, s: first.lat, e: first.lng, w: first.lng };
  for (const p of points) {
    b.n = Math.max(b.n, p.lat);
    b.s = Math.min(b.s, p.lat);
    b.e = Math.max(b.e, p.lng);
    b.w = Math.min(b.w, p.lng);
  }
  let zoom = maxZoom;
  for (; zoom > minZoom; zoom -= 0.05) {
    const a = project(b.n, b.w, zoom);
    const c = project(b.s, b.e, zoom);
    if (c[0] - a[0] <= width - 2 * side && c[1] - a[1] <= height - top - bottom) break;
  }
  const a = project(b.n, b.w, zoom);
  const c = project(b.s, b.e, zoom);
  const mx = (a[0] + c[0]) / 2;
  const my = (a[1] + c[1]) / 2 - (top + (height - bottom) - height) / 2;
  return { ...unproject(mx, my, zoom), zoom };
}

/**
 * Le nom de la commune la plus proche du centre de la zone : la ville de l'adresse du lieu le plus proche (« 66700 Argelès-sur-Mer »), à
 * défaut la préfecture la plus proche. Sert à la ligne « Autour de Canet-en-Roussillon, la zone de la carte. ».
 */
export function nearestTownName(
  centre: LatLng,
  places: readonly { address: string | null; lat: number; lng: number }[],
): string {
  let best: { km: number; town: string } | null = null;
  for (const p of places) {
    const town = /\b\d{5}\s+(.+)$/.exec(p.address ?? "")?.[1]?.trim();
    if (!town) continue;
    const km = distanceKm(centre, p);
    if (!best || km < best.km) best = { km, town };
  }
  const pref = Object.values(departmentPrefectures).reduce<{ km: number; town: string } | null>((acc, p) => {
    const km = distanceKm(centre, p);
    return !acc || km < acc.km ? { km, town: p.city } : acc;
  }, null);
  if (best && (!pref || best.km <= 15 || best.km < pref.km)) return best.town;
  return pref?.town ?? best?.town ?? "";
}

/**
 * Comme `placesInZone`, avec la coupe (tour 4) : quand plus de `max` lieux sont dans la zone, on en sert `max` **répartis équitablement entre les
 * cases de 0,1°** de la zone (tour par tour : le lieu le plus proche du centre de chaque case non vide, puis le suivant, les cases prises dans
 * l'ordre de leur distance au centre de la zone). `partialCells` : les cases dont tous les lieux n'ont pas été servis (les autres, vides
 * comprises, sont complètes). Un lieu dans un coin de case arrive donc toujours, même sous 200 lieux au centre de la case voisine.
 */
export function placesInZoneInfo<T extends { id: string; lat: number; lng: number }>(
  places: readonly T[],
  z: PracticalZone,
  max = PRACTICAL_MAX,
): { places: T[]; cut: boolean; partialCells: [number, number][] } {
  const page = placesInZonePage(places, z, 0, max);
  return { places: page.places, cut: page.more, partialCells: page.partialCells };
}

/** Au plus ce nombre de pages (de 200 lieux) pour une même zone ; au-delà, « Trop de lieux ici : zoome davantage. ». */
export const PRACTICAL_ZONE_MAX_PAGES = 10;

/**
 * La page `page` (0 pour la première) de la répartition par case d'une zone : l'ordre est le tour par tour décrit pour `placesInZoneInfo`
 * (un lieu par case non vide, puis le suivant…), découpé en pages de `max` lieux. `partialCells` : les cases dont tous les lieux ne sont
 * PAS servis au total (pages précédentes comprises) ; `more` : il reste des lieux (une page suivante existe). La dernière page rend donc la
 * zone complète (`more` faux, aucune case incomplète).
 */
export function placesInZonePage<T extends { id: string; lat: number; lng: number }>(
  places: readonly T[],
  z: PracticalZone,
  page: number,
  max = PRACTICAL_MAX,
): { places: T[]; more: boolean; partialCells: [number, number][]; version: string } {
  const all = placesInZone(places, z, Number.POSITIVE_INFINITY);
  if (all.length <= max && page === 0) return { places: all, more: false, partialCells: [], version: "" };
  const cells = new Map<string, { i: number; j: number; list: T[]; km: number }>();
  for (const p of all) {
    const i = cellDown(p.lat);
    const j = cellDown(p.lng);
    const key = `${i},${j}`;
    let c = cells.get(key);
    if (!c) {
      c = { i, j, list: [], km: distanceKm(zoneCenter(z), { lat: (i + 0.5) / 10, lng: (j + 0.5) / 10 }) };
      cells.set(key, c);
    }
    c.list.push(p);
  }
  for (const c of cells.values()) {
    const mid = { lat: (c.i + 0.5) / 10, lng: (c.j + 0.5) / 10 };
    c.list.sort((a, b) => distanceKm(mid, a) - distanceKm(mid, b) || a.id.localeCompare(b.id));
  }
  const order = [...cells.values()].sort((a, b) => a.km - b.km || a.i - b.i || a.j - b.j);
  const sequence: { p: T; key: string }[] = [];
  for (let round = 0; ; round++) {
    let any = false;
    for (const c of order) {
      const p = c.list[round];
      if (!p) continue;
      any = true;
      sequence.push({ p, key: `${c.i},${c.j}` });
    }
    if (!any) break;
  }
  const served = sequence.slice(0, (page + 1) * max);
  const taken = new Map<string, number>();
  for (const { key } of served) taken.set(key, (taken.get(key) ?? 0) + 1);
  const partialCells = order
    .filter((c) => (taken.get(`${c.i},${c.j}`) ?? 0) < c.list.length)
    .map((c): [number, number] => [c.i, c.j]);
  return {
    places: sequence.slice(page * max, (page + 1) * max).map((x) => x.p),
    more: sequence.length > (page + 1) * max,
    partialCells,
    // L'empreinte de la séquence COMPLÈTE de la zone : une page suivante lue sur d'autres données (cache renouvelé) est reconnue.
    version: fingerprint(sequence.map((x) => x.p.id)),
  };
}

/** Une empreinte courte (deux condensats de 32 bits, base 36) d'une liste d'identifiants : jamais une donnée de position. */
export function fingerprint(ids: readonly string[]): string {
  let a = 0x811c9dc5;
  let b = 0x9747b28c;
  for (const id of ids) {
    for (let i = 0; i < id.length; i++) {
      const c = id.charCodeAt(i);
      a = Math.imul(a ^ c, 16777619);
      b = Math.imul(b ^ c, 2654435761);
    }
    a = Math.imul(a ^ 124, 16777619);
    b = Math.imul(b ^ 124, 2654435761);
  }
  return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}`;
}

/**
 * Les ordres donnés à la carte avant qu'elle soit prête (MapLibre se charge de façon asynchrone) : le dernier est gardé et appliqué à
 * l'initialisation ; un ordre déjà appliqué ne l'est jamais deux fois.
 */
export function createOrderQueue<T extends { seq: number }>() {
  let pending: T | null = null;
  let applied = 0;
  return {
    /** Un ordre arrive (la carte est prête ou non) : renvoie vrai s'il est nouveau. */
    offer(order: T | null): boolean {
      if (!order || order.seq <= applied) return false;
      pending = order;
      return true;
    },
    /** La carte est prête : applique l'ordre en attente, une seule fois. */
    flush(apply: (order: T) => void): void {
      const order = pending;
      if (!order) return;
      pending = null;
      applied = order.seq;
      apply(order);
    },
    /** Les ordres déjà donnés avant le montage de la carte sont réputés appliqués par sa vue de départ. */
    skipTo(seq: number): void {
      applied = Math.max(applied, seq);
    },
  };
}
