import "maplibre-gl/dist/maplibre-gl.css";
import { pinDateLabel, placePins } from "@orasso/design-system/web";
import { useEffect, useRef } from "react";
import { useOrassoMap } from "./useOrassoMap";

/** Centre par défaut de l'épingle quand aucune adresse n'est encore placée (Perpignan). */
const DEFAULT_CENTER = { lat: 42.6887, lng: 2.8948 };

type PinMove = (lat: number, lng: number) => void;

/**
 * Carte d'un événement (page publique) au style Orasso (lot 44) : l'étiquette datée de l'événement à son adresse.
 * `draggablePin` (lot 53, assistant de création) : une épingle moutarde à déplacer (glisser, ou toucher la carte) pour
 * viser l'entrée exacte ; `onPinMove` reçoit la nouvelle position. La carte n'est pas recréée quand l'épingle bouge.
 */
export function EventMap({
  lat,
  lng,
  label,
  startsAt,
  draggablePin,
  onPinMove,
}: {
  lat: number | null;
  lng: number | null;
  label: string;
  startsAt?: string;
  draggablePin?: boolean;
  onPinMove?: PinMove;
}) {
  const container = useRef<HTMLElement>(null);
  const marker = useRef<import("maplibre-gl").Marker | null>(null);
  const mapRef = useRef<import("maplibre-gl").Map | null>(null);
  const moveRef = useRef<PinMove | undefined>(onPinMove);
  moveRef.current = onPinMove;
  const center = { lat: lat ?? DEFAULT_CENTER.lat, lng: lng ?? DEFAULT_CENTER.lng };
  const failed = useOrassoMap(
    container,
    { center: [center.lng, center.lat], zoom: lat === null ? 9 : 15 },
    (maplibre, { map }) => {
      if (!draggablePin) {
        const pins = placePins(maplibre, map, [
          {
            id: "event",
            kind: "event",
            lat: center.lat,
            lng: center.lng,
            label: startsAt ? pinDateLabel(startsAt) : "ICI",
            title: label,
          },
        ]);
        return () => pins.remove();
      }
      const el = document.createElement("div");
      el.className = "wz-dragpin";
      el.setAttribute("data-testid", "wizard-pin");
      el.innerHTML =
        '<svg viewBox="0 0 46 58" aria-hidden="true"><path d="M23 56S3 38 3 22a20 20 0 0 1 40 0c0 16-20 34-20 34z"/><circle cx="23" cy="22" r="7"/></svg>';
      const m = new maplibre.Marker({ element: el, draggable: true, anchor: "bottom" })
        .setLngLat([center.lng, center.lat])
        .addTo(map);
      m.on("dragend", () => {
        const p = m.getLngLat();
        moveRef.current?.(p.lat, p.lng);
      });
      map.on("click", (e) => {
        m.setLngLat(e.lngLat);
        moveRef.current?.(e.lngLat.lat, e.lngLat.lng);
      });
      marker.current = m;
      mapRef.current = map;
      return () => {
        m.remove();
        marker.current = null;
        mapRef.current = null;
      };
    },
    draggablePin ? "draggable" : `${lat}|${lng}|${label}|${startsAt ?? ""}`,
  );

  // Épingle déplaçable : une position venue d'ailleurs (adresse trouvée) déplace l'épingle et la vue.
  useEffect(() => {
    if (!draggablePin || lat === null || lng === null || !marker.current) return;
    const at = marker.current.getLngLat();
    if (Math.abs(at.lat - lat) < 1e-7 && Math.abs(at.lng - lng) < 1e-7) return;
    marker.current.setLngLat([lng, lat]);
    mapRef.current?.jumpTo({ center: [lng, lat], zoom: Math.max(mapRef.current.getZoom(), 15) });
  }, [draggablePin, lat, lng]);

  if (failed) return <p className="s-muted">La carte n'a pas pu se charger.</p>;
  // Une région nommée (pas `role="img"` : le cadre contient des boutons, les marqueurs).
  return (
    <section
      ref={container}
      className={draggablePin ? "ev__map wz-map" : "ev__map"}
      aria-label={`Carte : ${label}`}
      data-testid="event-map"
    />
  );
}
