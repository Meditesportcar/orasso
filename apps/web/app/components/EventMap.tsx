import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";

/** Carte MapLibre sur fond OpenStreetMap, chargée dans le navigateur seulement (le serveur ne rend que le cadre). */
export function EventMap({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let map: import("maplibre-gl").Map | undefined;
    let cancelled = false;
    (async () => {
      try {
        const maplibre = await import("maplibre-gl");
        if (cancelled || !container.current) return;
        map = new maplibre.Map({
          container: container.current,
          center: [lng, lat],
          zoom: 14,
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
        const marker = document.createElement("div");
        marker.className = "s-marker";
        new maplibre.Marker({ element: marker }).setLngLat([lng, lat]).addTo(map);
      } catch {
        setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [lat, lng]);

  if (failed) return <p className="s-muted">La carte n'a pas pu se charger.</p>;
  return <div ref={container} className="ev__map" role="img" aria-label={`Carte : ${label}`} />;
}
