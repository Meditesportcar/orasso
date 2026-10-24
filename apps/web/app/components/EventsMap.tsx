import "maplibre-gl/dist/maplibre-gl.css";
import { fitPoints, pinDateLabel, placePins, type WebPin } from "@orasso/design-system/web";
import type { EventCard } from "@orasso/shared";
import { useMemo, useRef } from "react";
import { now } from "../lib/clock";
import { useOrassoMap } from "./useOrassoMap";

const FRANCE: [number, number] = [2.35, 46.6];

/**
 * Carte des événements d'une liste qui ont une position, au style Orasso (lot 44) : une étiquette datée par
 * événement, les proches regroupés en pastille ; un clic ouvre une bulle avec le lien vers la page.
 */
export function EventsMap({ events }: { events: EventCard[] }) {
  const container = useRef<HTMLElement>(null);
  const located = useMemo(() => events.filter((e) => e.lat != null && e.lng != null), [events]);
  const failed = useOrassoMap(
    container,
    { center: FRANCE, zoom: 4.6 },
    (maplibre, { map }) => {
      const pins: WebPin[] = located.map((e) => ({
        id: e.id,
        kind: "event",
        lat: e.lat as number,
        lng: e.lng as number,
        label: pinDateLabel(e.startsAt, now()),
        title: e.title,
      }));
      const bySlug = new Map(located.map((e) => [e.id, e.slug]));
      fitPoints(maplibre, map, pins);
      const placed = placePins(maplibre, map, pins, {
        popupFor: (pin) => {
          const link = document.createElement("a");
          link.className = "s-popup";
          link.href = `/e/${encodeURIComponent(bySlug.get(pin.id) ?? "")}`;
          link.textContent = pin.title;
          return link;
        },
      });
      return () => placed.remove();
    },
    located,
  );

  if (failed) return <p className="s-muted">La carte n'a pas pu se charger.</p>;
  return (
    <section
      ref={container}
      className="ev__map evs__map"
      aria-label={`Carte des événements (${located.length})`}
      data-testid="events-map"
      data-count={located.length}
    />
  );
}
