import "maplibre-gl/dist/maplibre-gl.css";
import { pinDateLabel, placePins } from "@orasso/design-system/web";
import { useRef } from "react";
import { useOrassoMap } from "./useOrassoMap";

/**
 * Carte d'un événement (page publique) au style Orasso (lot 44) : l'étiquette datée de l'événement à son adresse.
 * `draggablePin` : épingle déplaçable de l'assistant de création (lot 53), pas encore branchée.
 */
export function EventMap({
  lat,
  lng,
  label,
  startsAt,
}: {
  lat: number;
  lng: number;
  label: string;
  startsAt?: string;
  draggablePin?: boolean;
}) {
  const container = useRef<HTMLElement>(null);
  const failed = useOrassoMap(
    container,
    { center: [lng, lat], zoom: 14 },
    (maplibre, { map }) => {
      const pins = placePins(maplibre, map, [
        { id: "event", kind: "event", lat, lng, label: startsAt ? pinDateLabel(startsAt) : "ICI", title: label },
      ]);
      return () => pins.remove();
    },
    `${lat}|${lng}|${label}|${startsAt ?? ""}`,
  );

  if (failed) return <p className="s-muted">La carte n'a pas pu se charger.</p>;
  // Une région nommée (pas `role="img"` : le cadre contient des boutons, les marqueurs).
  return <section ref={container} className="ev__map" aria-label={`Carte : ${label}`} data-testid="event-map" />;
}
