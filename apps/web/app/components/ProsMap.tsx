import "maplibre-gl/dist/maplibre-gl.css";
import { fitPoints, placePins, type WebPin } from "@orasso/design-system/web";
import type { ProCard } from "@orasso/shared";
import { useMemo, useRef } from "react";
import { useOrassoMap } from "./useOrassoMap";

const FRANCE: [number, number] = [2.35, 46.6];

/**
 * Carte des pros qui ont une adresse localisée, au style Orasso (lot 44) : une plaque par pro, les proches regroupés
 * en pastille ; un clic ouvre une bulle avec le lien vers sa fiche.
 */
export function ProsMap({ pros }: { pros: ProCard[] }) {
  const container = useRef<HTMLElement>(null);
  const located = useMemo(() => pros.filter((p) => p.lat != null && p.lng != null), [pros]);
  const failed = useOrassoMap(
    container,
    { center: FRANCE, zoom: 4.6 },
    (maplibre, { map }) => {
      const pins: WebPin[] = located.map((p) => ({
        id: p.slug,
        kind: "pro",
        lat: p.lat as number,
        lng: p.lng as number,
        label: p.name,
        title: p.name,
      }));
      fitPoints(maplibre, map, pins);
      const placed = placePins(maplibre, map, pins, {
        popupFor: (pin) => {
          const link = document.createElement("a");
          link.className = "s-popup";
          link.href = `/p/${encodeURIComponent(pin.id)}`;
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
      aria-label={`Carte des pros (${located.length})`}
      data-testid="pros-map"
      data-count={located.length}
    />
  );
}
