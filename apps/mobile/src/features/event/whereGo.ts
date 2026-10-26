// Lot R5d (maquette R5.11) : « Y aller » dans la fiche de l'événement. Règles pures, sans React Native : Maps et Waze
// à toute date (l'adresse d'un événement est publique) ; par les coordonnées, sinon par l'adresse ; ni l'une ni
// l'autre : rien (un nom de ville seul mènerait au mauvais endroit).
import { distanceKm, type LatLng } from "@orasso/shared";
import type { Destination } from "@/lib/directions";

type Place = {
  title: string;
  lat: number | null;
  lng: number | null;
  addressLine: string | null;
  city: string | null;
};

export function goDestination(e: Place): Destination | null {
  const located = e.lat !== null && e.lng !== null;
  const address = e.addressLine?.trim() ? e.addressLine.trim() : null;
  if (!located && !address) return null;
  return { title: e.title, lat: e.lat, lng: e.lng, addressLine: address, city: e.city };
}

/** Distance à vol d'oiseau entre la position de l'appareil et l'événement ; `null` sans coordonnées. */
export function kmToEvent(from: LatLng | null, e: Pick<Place, "lat" | "lng">): number | null {
  if (!from || e.lat === null || e.lng === null) return null;
  return distanceKm(from, { lat: e.lat, lng: e.lng });
}
