// Géocodage des adresses d'événements et de structures (carte de /evenements, filtre « près de chez toi »).
// Géoplateforme de l'IGN (Base Adresse Nationale), gratuite et sans clé. Meilleur effort : une adresse non trouvée ou un
// service injoignable ne bloque jamais l'enregistrement (l'événement n'apparaît simplement pas sur la carte).
import { departmentFromPostalCode } from "@orasso/shared";

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

/** Adresse postale d'un événement ou d'une structure en une ligne pour le géocodeur. */
export function addressQuery(a: { addressLine?: string | null; postalCode?: string | null; city?: string | null }) {
  return [a.addressLine, a.postalCode, a.city].filter(Boolean).join(" ");
}
