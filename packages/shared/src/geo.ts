// Géographie sans PostGIS (choix C24) : la position d'un utilisateur est le centre de son premier département de
// secteur, jamais plus précise (docs/01, ARCHITECTURE-SUITE HS5). Coordonnées approchées du centre géographique de
// chaque département (à quelques kilomètres près : suffisant pour un rayon de 10 à 300 km).

export type LatLng = { lat: number; lng: number };

export const departmentCentroids: Record<string, LatLng> = {
  "01": { lat: 46.1, lng: 5.35 },
  "02": { lat: 49.56, lng: 3.56 },
  "03": { lat: 46.39, lng: 3.19 },
  "04": { lat: 44.1, lng: 6.24 },
  "05": { lat: 44.66, lng: 6.27 },
  "06": { lat: 43.94, lng: 7.12 },
  "07": { lat: 44.75, lng: 4.42 },
  "08": { lat: 49.62, lng: 4.64 },
  "09": { lat: 42.92, lng: 1.5 },
  "10": { lat: 48.3, lng: 4.16 },
  "11": { lat: 43.1, lng: 2.41 },
  "12": { lat: 44.28, lng: 2.68 },
  "13": { lat: 43.54, lng: 5.09 },
  "14": { lat: 49.1, lng: -0.36 },
  "15": { lat: 45.05, lng: 2.67 },
  "16": { lat: 45.72, lng: 0.2 },
  "17": { lat: 45.78, lng: -0.67 },
  "18": { lat: 47.06, lng: 2.49 },
  "19": { lat: 45.36, lng: 1.88 },
  "2A": { lat: 41.86, lng: 8.99 },
  "2B": { lat: 42.39, lng: 9.21 },
  "21": { lat: 47.42, lng: 4.77 },
  "22": { lat: 48.44, lng: -2.86 },
  "23": { lat: 46.09, lng: 2.02 },
  "24": { lat: 45.1, lng: 0.74 },
  "25": { lat: 47.17, lng: 6.36 },
  "26": { lat: 44.68, lng: 5.17 },
  "27": { lat: 49.11, lng: 0.99 },
  "28": { lat: 48.39, lng: 1.37 },
  "29": { lat: 48.26, lng: -4.06 },
  "30": { lat: 43.99, lng: 4.18 },
  "31": { lat: 43.36, lng: 1.17 },
  "32": { lat: 43.69, lng: 0.45 },
  "33": { lat: 44.83, lng: -0.58 },
  "34": { lat: 43.58, lng: 3.37 },
  "35": { lat: 48.15, lng: -1.64 },
  "36": { lat: 46.78, lng: 1.58 },
  "37": { lat: 47.26, lng: 0.69 },
  "38": { lat: 45.26, lng: 5.58 },
  "39": { lat: 46.73, lng: 5.7 },
  "40": { lat: 43.97, lng: -0.78 },
  "41": { lat: 47.62, lng: 1.43 },
  "42": { lat: 45.73, lng: 4.17 },
  "43": { lat: 45.13, lng: 3.81 },
  "44": { lat: 47.36, lng: -1.68 },
  "45": { lat: 47.91, lng: 2.34 },
  "46": { lat: 44.62, lng: 1.6 },
  "47": { lat: 44.37, lng: 0.46 },
  "48": { lat: 44.52, lng: 3.5 },
  "49": { lat: 47.39, lng: -0.56 },
  "50": { lat: 49.08, lng: -1.33 },
  "51": { lat: 48.95, lng: 4.24 },
  "52": { lat: 48.11, lng: 5.23 },
  "53": { lat: 48.15, lng: -0.65 },
  "54": { lat: 48.79, lng: 6.17 },
  "55": { lat: 48.99, lng: 5.38 },
  "56": { lat: 47.85, lng: -2.81 },
  "57": { lat: 49.04, lng: 6.66 },
  "58": { lat: 47.12, lng: 3.5 },
  "59": { lat: 50.45, lng: 3.21 },
  "60": { lat: 49.41, lng: 2.42 },
  "61": { lat: 48.62, lng: 0.13 },
  "62": { lat: 50.49, lng: 2.29 },
  "63": { lat: 45.73, lng: 3.14 },
  "64": { lat: 43.26, lng: -0.76 },
  "65": { lat: 43.05, lng: 0.16 },
  "66": { lat: 42.6, lng: 2.52 },
  "67": { lat: 48.67, lng: 7.55 },
  "68": { lat: 47.86, lng: 7.27 },
  "69": { lat: 45.87, lng: 4.64 },
  "70": { lat: 47.64, lng: 6.09 },
  "71": { lat: 46.64, lng: 4.54 },
  "72": { lat: 47.99, lng: 0.22 },
  "73": { lat: 45.48, lng: 6.44 },
  "74": { lat: 46.03, lng: 6.43 },
  "75": { lat: 48.86, lng: 2.34 },
  "76": { lat: 49.66, lng: 1.03 },
  "77": { lat: 48.63, lng: 2.93 },
  "78": { lat: 48.82, lng: 1.84 },
  "79": { lat: 46.54, lng: -0.31 },
  "80": { lat: 49.96, lng: 2.28 },
  "81": { lat: 43.79, lng: 2.17 },
  "82": { lat: 44.09, lng: 1.28 },
  "83": { lat: 43.46, lng: 6.22 },
  "84": { lat: 44.0, lng: 5.18 },
  "85": { lat: 46.68, lng: -1.3 },
  "86": { lat: 46.56, lng: 0.46 },
  "87": { lat: 45.89, lng: 1.24 },
  "88": { lat: 48.2, lng: 6.38 },
  "89": { lat: 47.84, lng: 3.56 },
  "90": { lat: 47.63, lng: 6.93 },
  "91": { lat: 48.52, lng: 2.24 },
  "92": { lat: 48.85, lng: 2.25 },
  "93": { lat: 48.92, lng: 2.48 },
  "94": { lat: 48.78, lng: 2.47 },
  "95": { lat: 49.08, lng: 2.13 },
  "971": { lat: 16.18, lng: -61.53 },
  "972": { lat: 14.65, lng: -61.02 },
  "973": { lat: 3.93, lng: -53.13 },
  "974": { lat: -21.13, lng: 55.53 },
  "976": { lat: -12.82, lng: 45.15 },
};

/** Distance à vol d'oiseau en kilomètres (formule de haversine). */
export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Position d'un profil : centre de son premier département de secteur, `null` sans secteur. */
export function profilePosition(departments: readonly string[]): LatLng | null {
  const first = departments[0];
  return first ? (departmentCentroids[first] ?? null) : null;
}

/** Rectangle qui contient le cercle de rayon `radiusKm` autour de `center` (préfiltre qui sert les index de position). */
export function boundingBox(
  center: LatLng,
  radiusKm: number,
): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const dLat = radiusKm / 111.2;
  const cosLat = Math.max(0.01, Math.cos((center.lat * Math.PI) / 180));
  const dLng = radiusKm / (111.2 * cosLat);
  return {
    minLat: center.lat - dLat,
    maxLat: center.lat + dLat,
    minLng: center.lng - dLng,
    maxLng: center.lng + dLng,
  };
}

/** D'où vient la position qui sert au tri par distance et au rayon. */
export type PositionSource = "device" | "sector";

/**
 * Position utilisée pour la distance (docs/01, HS5) : celle que l'appareil envoie pour cette requête seulement
 * (« Utiliser ma position », jamais stockée), sinon le centre du premier département de secteur du profil. Côté
 * serveur, jamais plus précise qu'un département.
 */
export function resolvePosition(
  explicit: { lat?: number | undefined; lng?: number | undefined },
  sector: readonly string[] | null,
): { position: LatLng; source: PositionSource } | null {
  if (explicit.lat !== undefined && explicit.lng !== undefined) {
    return { position: { lat: explicit.lat, lng: explicit.lng }, source: "device" };
  }
  const fromSector = sector ? profilePosition(sector) : null;
  return fromSector ? { position: fromSector, source: "sector" } : null;
}

/**
 * Position de l'appareil ramenée au dixième de degré (environ 11 km) avant d'être envoyée à l'API : « près de chez moi »
 * n'a pas besoin de plus, et une adresse web ou un journal d'accès ne gardent pas l'endroit exact où se trouve la personne.
 */
export function coarsePosition(p: LatLng): LatLng {
  return { lat: Math.round(p.lat * 10) / 10, lng: Math.round(p.lng * 10) / 10 };
}
