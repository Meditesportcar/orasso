// Carte de « Pratique » sur le site (lot R8q, maquette R8.12), sur le modèle de `EventsMap` : MapLibre au style Orasso (thème suivi en
// direct, repli raster d'`useOrassoMap`), mon point, l'épingle de l'événement ou de la ville cherchée, une épingle par lieu avec l'icône de
// sa sorte ; le lieu touché passe en moutarde. Petit lot de fin F (option C) : la carte est créée UNE fois et dit sa vue à la fin de chaque
// geste ; ses épingles se regroupent (pastille avec leur nombre : la toucher rapproche la carte jusqu'à les séparer, ou ouvre la liste quand
// elles sont à la même adresse) ; un voile léger couvre ce qui n'est pas encore chargé. Style des épingles : jetons de la page
// (`practical-r8q.css`). L'attribution d'OpenStreetMap reste sur la carte (pastille « i »).
import "maplibre-gl/dist/maplibre-gl.css";
import { clusterPins, GROUP_MAX_ZOOM, type IconName, iconShapes, isStacked } from "@orasso/design-system";
import {
  createOrderQueue,
  fitView,
  practicalTexts as L,
  type LatLng,
  type MapViewport,
  type PracticalKind,
  type PracticalZone,
  unloadedBands,
  viewZone,
  type ZoneCover,
  zoneContains,
} from "@orasso/shared";
import { useEffect, useRef } from "react";

import { useOrassoMap } from "../useOrassoMap";

export type PracticalPin = { id: string; kind: PracticalKind; title: string; lat: number; lng: number };

/** Un ordre à la caméra (le numéro change à chaque ordre) : aller à une vue, ou cadrer des lieux. */
export type MapCommand = { seq: number } & ({ view: MapViewport } | { fit: LatLng[] });

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

type MapLibre = typeof import("maplibre-gl");
type Handle = { map: import("maplibre-gl").Map; maplibre: MapLibre };

export function PracticalMap({
  pins,
  origin,
  selectedId,
  onSelect,
  onGroup,
  initial,
  command,
  cover,
  onView,
}: {
  pins: PracticalPin[];
  origin: { kind: "me" | "outing" | "searched"; at: LatLng } | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onGroup: (ids: string[]) => void;
  initial: MapViewport;
  command: MapCommand | null;
  cover: readonly ZoneCover[];
  onView: (zone: PracticalZone, zoom: number) => void;
}) {
  const container = useRef<HTMLElement>(null);
  const handle = useRef<Handle | null>(null);
  const markers = useRef<{ remove: () => void }[]>([]);
  const latest = useRef({ pins, origin, selectedId, onSelect, onGroup, cover, onView });
  latest.current = { pins, origin, selectedId, onSelect, onGroup, cover, onView };
  // Les ordres reçus avant que MapLibre soit prêt sont gardés (le dernier) et appliqués à l'initialisation ; ceux d'avant le montage sont
  // déjà portés par la vue de départ.
  const orders = useRef<ReturnType<typeof createOrderQueue<MapCommand>> | null>(null);
  if (!orders.current) {
    orders.current = createOrderQueue<MapCommand>();
    orders.current.skipTo(command?.seq ?? 0);
  }
  const applyOrder = (order: MapCommand) => {
    const h = handle.current;
    if (!h) return;
    const { w, h: height } = sizeOf();
    const t = "view" in order ? order.view : fitView(order.fit, w, height);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    h.map.flyTo({ center: [t.lng, t.lat], zoom: t.zoom, duration: reduce ? 0 : 420 });
  };

  const sizeOf = () => {
    const el = handle.current?.map.getContainer();
    return { w: el?.clientWidth || 352, h: el?.clientHeight || 360 };
  };
  const zoneOf = (): PracticalZone | null => {
    const m = handle.current?.map;
    if (!m) return null;
    const b = m.getBounds();
    return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
  };

  const drawVeil = () => {
    const h = handle.current;
    const zone = zoneOf();
    if (!h || !zone || !h.map.isStyleLoaded()) return;
    const bands = unloadedBands(latest.current.cover, zone);
    const data = {
      type: "FeatureCollection" as const,
      features: bands.map((x) => ({
        type: "Feature" as const,
        properties: {},
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [
              [x.west, x.south],
              [x.east, x.south],
              [x.east, x.north],
              [x.west, x.north],
              [x.west, x.south],
            ],
          ],
        },
      })),
    };
    const source = h.map.getSource("practical-veil") as { setData?: (d: unknown) => void } | undefined;
    if (source?.setData) source.setData(data);
    else {
      const ink = getComputedStyle(h.map.getContainer()).getPropertyValue("--ink").trim() || "#1f2227";
      h.map.addSource("practical-veil", { type: "geojson", data });
      h.map.addLayer({
        id: "practical-veil-fill",
        type: "fill",
        source: "practical-veil",
        paint: { "fill-color": ink, "fill-opacity": 0.12 },
      });
    }
  };

  const draw = () => {
    const h = handle.current;
    const zone = zoneOf();
    if (!h || !zone) return;
    const { maplibre, map } = h;
    for (const m of markers.current) m.remove();
    markers.current = [];
    const { pins: all, origin: from, selectedId: sel, onSelect: select, onGroup: group } = latest.current;
    const { w, h: height } = sizeOf();
    const zoom = map.getZoom();
    if (from) {
      const el = document.createElement("span");
      el.setAttribute("role", "img");
      el.dataset.testid =
        from.kind === "me" ? "practical-me" : from.kind === "outing" ? "practical-event" : "practical-searched";
      el.className = from.kind === "me" ? "pq-me" : "pq-event";
      el.setAttribute(
        "aria-label",
        from.kind === "me" ? "Ta position" : from.kind === "outing" ? "Événement" : "Ville cherchée",
      );
      if (from.kind !== "me") el.append(svgIcon(from.kind === "outing" ? "ticket" : "place"));
      markers.current.push(new maplibre.Marker({ element: el }).setLngLat([from.at.lng, from.at.lat]).addTo(map));
    }
    const padLat = ((zone.north - zone.south) * 20) / height;
    const padLng = ((zone.east - zone.west) * 20) / w;
    const visible = all.filter((p) => zoneContains(zone, p, padLat, padLng));
    const picked = visible.find((p) => p.id === sel) ?? null;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const g of clusterPins(
      visible.filter((p) => p.id !== picked?.id),
      Math.round(zoom),
    )) {
      const el = document.createElement("button");
      el.type = "button";
      if (g.items.length > 1) {
        const stacked = isStacked(g, zoom);
        el.className = "pq-grp";
        el.setAttribute("aria-label", L.groupAria(g.items.length, stacked));
        el.dataset.testid = "practical-group";
        // Les lieux de la pastille (lus par la recette : chaque ligne de la liste est une épingle ou dans une pastille).
        el.dataset.titles = JSON.stringify(g.items.map((p) => p.title));
        el.textContent = String(g.items.length);
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          if (stacked) group(g.items.map((p) => p.id));
          else {
            const t = fitView(g.items, w, height, { maxZoom: GROUP_MAX_ZOOM });
            map.flyTo({ center: [t.lng, t.lat], zoom: t.zoom, duration: reduce ? 0 : 420 });
          }
        });
      } else {
        const p = g.items[0] as PracticalPin;
        el.className = "pq-pin";
        el.setAttribute("aria-label", p.title);
        el.setAttribute("aria-pressed", "false");
        el.dataset.testid = `practical-pin-${p.id}`;
        el.append(svgIcon(p.kind === "fuel" ? "fuel" : "drop"));
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          select(p.id);
        });
      }
      markers.current.push(new maplibre.Marker({ element: el }).setLngLat([g.lng, g.lat]).addTo(map));
    }
    if (picked) {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "pq-pin";
      el.setAttribute("aria-label", picked.title);
      el.setAttribute("aria-pressed", "true");
      el.dataset.testid = `practical-pin-${picked.id}`;
      el.append(svgIcon(picked.kind === "fuel" ? "fuel" : "drop"));
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        select(picked.id);
      });
      const marker = new maplibre.Marker({ element: el }).setLngLat([picked.lng, picked.lat]).addTo(map);
      marker.getElement().style.zIndex = "2";
      markers.current.push(marker);
    }
  };

  // La carte est créée une fois : elle bouge, elle ne se recrée jamais (les épingles suivent plus bas).
  const failed = useOrassoMap(
    container,
    { center: [initial.lng, initial.lat], zoom: initial.zoom },
    (maplibre, { map }) => {
      handle.current = { map, maplibre };
      const seen = () => {
        const z = zoneOf();
        if (z) latest.current.onView(z, map.getZoom());
      };
      map.on("moveend", () => {
        seen();
        draw();
        drawVeil();
      });
      map.on("styledata", drawVeil);
      map.on("load", () => {
        seen();
        draw();
        drawVeil();
      });
      // Un cadre qui change de taille (la carte était masquée) : la carte se recale.
      const ro = new ResizeObserver(() => {
        map.resize();
      });
      ro.observe(map.getContainer());
      const { w, h } = sizeOf();
      latest.current.onView(viewZone(initial, w, h), initial.zoom);
      draw();
      // Un ordre arrivé pendant le chargement de la carte est appliqué maintenant.
      orders.current?.flush(applyOrder);
      return () => {
        ro.disconnect();
        for (const m of markers.current) m.remove();
        markers.current = [];
        handle.current = null;
      };
    },
    "practical-map-once",
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: `draw` lit les dernières valeurs par `latest`.
  useEffect(() => {
    draw();
    drawVeil();
  }, [pins, origin, selectedId, cover]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: un ordre par numéro.
  useEffect(() => {
    if (orders.current?.offer(command) && handle.current) orders.current.flush(applyOrder);
  }, [command]);

  if (failed) return <p className="s-muted">La carte n'a pas pu se charger.</p>;
  return <section ref={container} className="pq-map" aria-label={L.mapLabel} data-testid="practical-map-canvas" />;
}
