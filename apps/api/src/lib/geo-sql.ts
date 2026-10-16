// Distances en SQL, sans PostGIS (choix C24) : haversine à vol d'oiseau, avec un rectangle englobant devant pour que
// l'index (lat, lng) serve. Les valeurs de position sont des paramètres liés, jamais du texte collé.
import { boundingBox, type LatLng } from "@orasso/shared";
import { type AnyColumn, type SQL, sql } from "drizzle-orm";

type Col = AnyColumn | SQL;

/** Distance en km entre `from` et le point (latColumn, lngColumn) ; `null` quand la colonne est nulle. */
export function distanceKmSql(latColumn: Col, lngColumn: Col, from: LatLng) {
  return sql<
    number | null
  >`(case when ${latColumn} is null or ${lngColumn} is null then null else 6371 * acos(least(1, greatest(-1,
    cos(radians(${from.lat})) * cos(radians(${latColumn})) * cos(radians(${lngColumn}) - radians(${from.lng}))
    + sin(radians(${from.lat})) * sin(radians(${latColumn}))))) end)`;
}

/** Condition « dans un rayon de `radiusKm` km » : rectangle englobant (index) puis distance exacte. */
export function withinRadiusSql(latColumn: Col, lngColumn: Col, from: LatLng, radiusKm: number): SQL {
  const box = boundingBox(from, radiusKm);
  return sql`(${latColumn} between ${box.minLat} and ${box.maxLat} and ${lngColumn} between ${box.minLng} and ${box.maxLng}
    and ${distanceKmSql(latColumn, lngColumn, from)} <= ${radiusKm})`;
}

/** Distance arrondie au dixième de km pour l'affichage (`null` reste `null`). */
export function roundKm(km: number | null | undefined): number | null {
  return km === null || km === undefined || Number.isNaN(km) ? null : Math.round(km * 10) / 10;
}
