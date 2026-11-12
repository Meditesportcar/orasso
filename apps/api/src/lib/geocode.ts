// Géocodage des adresses d'événements et de structures (carte de /evenements, filtre « près de chez toi »).
// Géoplateforme de l'IGN (Base Adresse Nationale), gratuite et sans clé. Meilleur effort : une adresse non trouvée ou un
// service injoignable ne bloque jamais l'enregistrement (l'événement n'apparaît simplement pas sur la carte).
import { type CitySuggestion, departmentFromPostalCode, inFrance, roundPlace, weatherCell } from "@orasso/shared";

import { env } from "../env";

type FetchLike = typeof fetch;
let fetchImpl: FetchLike | null = null;

/** Tests : remplace l'appel réseau (`null` pour revenir au vrai service). */
export function setGeocodeFetch(f: FetchLike | null) {
  fetchImpl = f;
}

export type Geocoded = {
  lat: number;
  lng: number;
  label: string;
  postalCode: string | null;
  city: string | null;
  department: string | null;
};

export function geocodingEnabled(): boolean {
  return env.GEOCODER_URL !== "off" && (env.NODE_ENV !== "test" || fetchImpl !== null);
}

/** Meilleure correspondance d'une adresse (texte libre), ou `null`. */
export async function geocode(query: string): Promise<Geocoded | null> {
  const q = query.trim();
  if (q.length < 3 || !geocodingEnabled()) return null;
  try {
    const url = `${env.GEOCODER_URL}/search?q=${encodeURIComponent(q)}&limit=1`;
    const res = await (fetchImpl ?? fetch)(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: {
        geometry?: { coordinates?: [number, number] };
        properties?: { label?: string; postcode?: string; city?: string; score?: number };
      }[];
    };
    const f = data.features?.[0];
    const [lng, lat] = f?.geometry?.coordinates ?? [];
    if (lng === undefined || lat === undefined || (f?.properties?.score ?? 0) < 0.4) return null;
    const postalCode = f?.properties?.postcode ?? null;
    return {
      lat,
      lng,
      label: f?.properties?.label ?? q,
      postalCode,
      city: f?.properties?.city ?? null,
      department: departmentFromPostalCode(postalCode),
    };
  } catch {
    return null;
  }
}

type GeoFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: { label?: string; city?: string; name?: string; postcode?: string; depcode?: string; context?: string };
};

/** Code du département d'une commune de la Géoplateforme (`depcode`, sinon le début du contexte « 66, Pyrénées-Orientales… »). */
function departmentOf(f: GeoFeature): string | null {
  const code = f.properties?.depcode ?? f.properties?.context?.split(",")[0]?.trim();
  return code || departmentFromPostalCode(f.properties?.postcode ?? null);
}

/**
 * Lot R8m : des communes (et seulement elles) dont le nom commence par la recherche, huit au plus, pour « Changer de lieu » :
 * « Argelès-sur-Mer (66) ». Coordonnées arrondies à 0,01° ; une commune hors de France du référentiel est écartée. Service
 * injoignable : aucune proposition, jamais d'erreur.
 */
export async function searchCities(query: string): Promise<CitySuggestion[]> {
  const q = query.trim();
  if (q.length < 2 || !geocodingEnabled()) return [];
  try {
    const url = `${env.GEOCODER_URL}/search?q=${encodeURIComponent(q)}&type=municipality&limit=8`;
    const res = await (fetchImpl ?? fetch)(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { features?: GeoFeature[] };
    const out: CitySuggestion[] = [];
    const seen = new Set<string>();
    for (const f of data.features ?? []) {
      const [lng, lat] = f.geometry?.coordinates ?? [];
      const name = f.properties?.city ?? f.properties?.name ?? f.properties?.label;
      if (typeof lng !== "number" || typeof lat !== "number" || !name) continue;
      const at = roundPlace({ lat, lng });
      if (!inFrance(at)) continue;
      const department = departmentOf(f);
      const label = department ? `${name} (${department})` : name;
      if (seen.has(label)) continue;
      seen.add(label);
      out.push({ label, ...at });
    }
    return out.slice(0, 8);
  } catch {
    return [];
  }
}

/**
 * Lot R8m : la commune d'une case de 0,1° (« Utiliser ma position »), ou `null`. La position est arrondie ICI, avant tout
 * appel : la Géoplateforme ne reçoit que le centre de la case (jamais la position exacte), et rien n'est journalisé.
 * Conséquence assumée : la case peut nommer la commune voisine.
 */
export async function reverseCity(position: { lat: number; lng: number }): Promise<string | null> {
  if (!geocodingEnabled()) return null;
  const cell = weatherCell(position);
  try {
    const url = `${env.GEOCODER_URL}/reverse?lon=${cell.lng}&lat=${cell.lat}&limit=1`;
    const res = await (fetchImpl ?? fetch)(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { features?: GeoFeature[] };
    return data.features?.[0]?.properties?.city ?? null;
  } catch {
    return null;
  }
}

/** Adresse postale d'un événement ou d'une structure en une ligne pour le géocodeur. */
export function addressQuery(a: { addressLine?: string | null; postalCode?: string | null; city?: string | null }) {
  return [a.addressLine, a.postalCode, a.city].filter(Boolean).join(" ");
}
