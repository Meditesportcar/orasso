import "maplibre-gl/dist/maplibre-gl.css";
import type { ProCard } from "@orasso/shared";
import { useEffect, useMemo, useRef, useState } from "react";

const FRANCE: [number, number] = [2.35, 46.6];

/**
 * Carte MapLibre (fond OpenStreetMap) des pros qui ont une adresse localisée : un repère par pro, un clic ouvre une
 * bulle avec le lien vers sa fiche. Même principe que la carte des événements ; chargée dans le navigateur seulement.
 */
export function ProsMap({ pros }: { pros: ProCard[] }) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const located = useMemo(() => pros.filter((p) => p.lat != null && p.lng != null), [pros]);

  useEffect(() => {
    let map: import("maplibre-gl").Map | undefined;
    let cancelled = false;
    (async () => {
      try {
        const maplibre = await import("maplibre-gl");
        if (cancelled || !container.current) return;
        map = new maplibre.Map({
          container: container.current,
          center: FRANCE,
          zoom: 4.6,
          attributionControl: { compact: true },
          style: {
            version: 8,
            sources: {
              osm: {
                type: "raster",
                tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
                tileSize: 256,
                maxzoom: 19,
                attribution: "© OpenStreetMap",
              },
            },
            layers: [{ id: "osm", type: "raster", source: "osm" }],
          },
        });
        const bounds = new maplibre.LngLatBounds();
        for (const pro of located) {
          const lngLat: [number, number] = [pro.lng as number, pro.lat as number];
          const marker = document.createElement("button");
          marker.type = "button";
          marker.className = "s-marker s-marker--button";
          marker.dataset.testid = "map-marker";
          marker.setAttribute("aria-label", pro.name);
          const link = document.createElement("a");
          link.className = "s-popup";
          link.href = `/p/${encodeURIComponent(pro.slug)}`;
          link.textContent = pro.name;
          const popup = new maplibre.Popup({ offset: 14, closeButton: false }).setDOMContent(link);
          new maplibre.Marker({ element: marker }).setLngLat(lngLat).setPopup(popup).addTo(map);
          bounds.extend(lngLat);
        }
        if (located.length === 1) map.setCenter([located[0]?.lng as number, located[0]?.lat as number]);
        if (located.length === 1) map.setZoom(10);
        else if (located.length > 1) map.fitBounds(bounds, { padding: 48, maxZoom: 11, duration: 0 });
      } catch {
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [located]);

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
