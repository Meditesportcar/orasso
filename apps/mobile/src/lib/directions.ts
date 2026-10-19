// Itinéraires vers un événement (lot 43) : Maps (application de cartes de l'appareil, sinon Google Maps) et Waze. Aucun
// service Orasso ici : seulement les adresses qui ouvrent l'application de l'appareil. La position de la personne n'est
// jamais lue.
import { Linking, Platform } from "react-native";

export type Destination = {
  lat: number | null;
  lng: number | null;
  addressLine?: string | null;
  city?: string | null;
  title: string;
};

function where(d: Destination): string {
  return d.lat !== null && d.lng !== null ? `${d.lat},${d.lng}` : [d.addressLine, d.city].filter(Boolean).join(", ");
}

export function mapsUrl(d: Destination): string {
  const target = where(d);
  if (Platform.OS === "ios") return `maps:?daddr=${encodeURIComponent(target)}`;
  if (Platform.OS === "android") return `geo:0,0?q=${encodeURIComponent(target)}(${encodeURIComponent(d.title)})`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(target)}`;
}

/** Waze accepte des coordonnées ou une recherche ; adresse web universelle (ouvre l'appli si elle est installée). */
export function wazeUrl(d: Destination): string {
  if (d.lat !== null && d.lng !== null) return `https://waze.com/ul?ll=${d.lat},${d.lng}&navigate=yes`;
  return `https://waze.com/ul?q=${encodeURIComponent(where(d))}&navigate=yes`;
}

export const openMaps = (d: Destination) => void Linking.openURL(mapsUrl(d)).catch(() => undefined);
export const openWaze = (d: Destination) => void Linking.openURL(wazeUrl(d)).catch(() => undefined);
