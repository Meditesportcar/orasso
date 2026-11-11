// Carte de « Pratique » sur le site (lot R8q, maquette R8.12), sur le modèle de `EventsMap` : MapLibre au style Orasso (thème suivi en
// direct, repli raster d'`useOrassoMap`), mon point ou l'épingle de l'événement, une épingle par lieu avec l'icône de sa sorte ;
// le lieu touché passe en moutarde. L'attribution d'OpenStreetMap reste sur la carte (pastille « i »). Style des épingles : jetons
// de la page (`practical-r8q.css`).
import "maplibre-gl/dist/maplibre-gl.css";
import { type IconName, iconShapes } from "@orasso/design-system";
import { fitPoints } from "@orasso/design-system/web";
import { practicalTexts as L, type LatLng, type PracticalKind } from "@orasso/shared";
import { useEffect, useMemo, useRef } from "react";

import { useOrassoMap } from "../useOrassoMap";

export type PracticalPin = { id: string; kind: PracticalKind; title: string; lat: number; lng: number };

const FRANCE: [number, number] = [2.35, 46.6];
const SVG_NS = "http://www.w3.org/2000/svg";

function svgIcon(name: IconName): SVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const [tag, attrs] of iconShapes[name]) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
    svg.append(node);
  }
  return svg;
}

export function PracticalMap({
  pins,
  origin,
  selectedId,
  onSelect,
}: {
  pins: PracticalPin[];
  origin: { kind: "me" | "outing"; at: LatLng } | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const container = useRef<HTMLElement>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const buttons = useRef(new Map<string, HTMLElement>());
  // La carte est recréée (et recadrée) quand les lieux ou l'origine changent, pas quand on touche une épingle.
  const key = useMemo(
    () => `${origin?.kind}:${origin?.at.lat},${origin?.at.lng}|${pins.map((p) => p.id).join(",")}`,
    [pins, origin],
  );
  const failed = useOrassoMap(
    container,
    { center: FRANCE, zoom: 4.6 },
    (maplibre, { map }) => {
      buttons.current.clear();
      const markers: { remove: () => void }[] = [];
      if (origin) {
        const el = document.createElement("span");
        el.setAttribute("role", "img");
        el.dataset.testid = origin.kind === "me" ? "practical-me" : "practical-event";
        el.className = origin.kind === "me" ? "pq-me" : "pq-event";
        el.setAttribute("aria-label", origin.kind === "me" ? "Ta position" : "Événement");
        if (origin.kind === "outing") el.append(svgIcon("ticket"));
        markers.push(new maplibre.Marker({ element: el }).setLngLat([origin.at.lng, origin.at.lat]).addTo(map));
      }
      for (const p of pins) {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "pq-pin";
        el.setAttribute("aria-label", p.title);
        el.setAttribute("aria-pressed", String(p.id === selectedRef.current));
        el.dataset.testid = `practical-pin-${p.id}`;
        el.append(svgIcon(p.kind === "fuel" ? "fuel" : "drop"));
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelectRef.current(p.id);
        });
        buttons.current.set(p.id, el);
        markers.push(new maplibre.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map));
      }
      fitPoints(maplibre, map, [...pins, ...(origin ? [{ id: "origin", ...origin.at }] : [])]);
      return () => {
        for (const m of markers) m.remove();
      };
    },
    key,
  );
  // Le lieu touché passe en moutarde sans recréer la carte.
  useEffect(() => {
    for (const [id, el] of buttons.current) el.setAttribute("aria-pressed", String(id === selectedId));
  }, [selectedId]);

  if (failed) return <p className="s-muted">La carte n'a pas pu se charger.</p>;
  return <section ref={container} className="pq-map" aria-label={L.mapLabel} data-testid="practical-map-canvas" />;
}
