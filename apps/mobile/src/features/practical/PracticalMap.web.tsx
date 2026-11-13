// Carte de « Pratique » dans un navigateur (recette de l'appli, react-native-web ; lot R8q) : MapLibre GL JS au même style Orasso que
// le téléphone (thème suivi en direct, sans rotation, repli raster), mêmes épingles. Petit lot de fin F : elle dit sa vue à la fin de chaque
// geste, regroupe ses épingles (pastille avec leur nombre) et couvre d'un voile léger ce qui n'est pas encore chargé. Aucune importation de
// `@maplibre/maplibre-react-native` ici : le module natif ne se charge pas dans un navigateur.
import "maplibre-gl/dist/maplibre-gl.css";
import "@orasso/design-system/map/map.css";
import { clusterPins, GROUP_MAX_ZOOM, type IconName, iconShapes, isStacked } from "@orasso/design-system";
import { createOrassoMap, mapCssVars, type OrassoMap } from "@orasso/design-system/map/web";
import { tokens, useTheme } from "@orasso/design-system/native";
import { fitView, practicalTexts as L, unloadedBands, viewZone, zoneContains } from "@orasso/shared";
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";

import { mapGlyphsOrigin, mapTilesUrl } from "@/features/explorer/mapPins";
import { quietAttribution } from "@/features/explorer/quietAttribution";
import type { PracticalMapProps, PracticalPin } from "./mapTypes";

type MapLibre = typeof import("maplibre-gl");

/** Vrai : la carte s'affiche aussi dans un navigateur. */
export const mapSupported = true;

const SVG_NS = "http://www.w3.org/2000/svg";
const iconOf = (kind: PracticalPin["kind"]): IconName => (kind === "fuel" ? "fuel" : "drop");

/** Un pictogramme du jeu d'icônes d'Orasso en `<svg>` (trait de 2 px, grille de 24 px). */
function svgIcon(name: IconName, color: string): SVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", color);
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
  onGroup,
  initial,
  command,
  cover,
  onView,
  height,
}: PracticalMapProps) {
  const { theme, reducedMotion } = useTheme();
  const box = useRef<HTMLElement | null>(null);
  const handle = useRef<OrassoMap | null>(null);
  const lib = useRef<MapLibre | null>(null);
  const markers = useRef<{ remove: () => void }[]>([]);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const latest = useRef({ pins, origin, selectedId, onSelect, onGroup, cover, onView, reducedMotion });
  latest.current = { pins, origin, selectedId, onSelect, onGroup, cover, onView, reducedMotion };
  const lastSeq = useRef(command?.seq ?? 0);

  const size = () => {
    const m = handle.current?.map;
    const el = m?.getContainer();
    return { w: el?.clientWidth || 352, h: el?.clientHeight || 400 };
  };

  /** Le voile sur ce qui n'est pas chargé : une source GeoJSON, reposée après chaque changement de style (thème). */
  const drawVeil = () => {
    const created = handle.current;
    if (!created) return;
    const map = created.map;
    if (!map.isStyleLoaded()) return;
    const b = map.getBounds();
    const zone = { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
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
    const source = map.getSource("practical-veil") as { setData?: (d: unknown) => void } | undefined;
    if (source?.setData) source.setData(data);
    else {
      map.addSource("practical-veil", { type: "geojson", data });
      map.addLayer({
        id: "practical-veil-fill",
        type: "fill",
        source: "practical-veil",
        paint: { "fill-color": tokens.color[themeRef.current].ink, "fill-opacity": 0.12 },
      });
    }
  };

  // Pose les épingles : mon point, puis les pastilles de groupes et les lieux de la vue.
  const draw = () => {
    const maplibre = lib.current;
    const created = handle.current;
    if (!maplibre || !created) return;
    const c = tokens.color[themeRef.current];
    for (const m of markers.current) m.remove();
    markers.current = [];
    const { pins: all, origin: from, selectedId: sel, onSelect: select, onGroup: group } = latest.current;
    const map = created.map;
    const b = map.getBounds();
    const zone = { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
    const { w, h } = size();
    const zoom = map.getZoom();
    if (from) {
      const el = document.createElement("span");
      el.setAttribute("role", "img");
      el.dataset.testid =
        from.kind === "me" ? "practical-me" : from.kind === "outing" ? "practical-event" : "practical-searched";
      if (from.kind === "me") {
        el.setAttribute("aria-label", "Ta position");
        Object.assign(el.style, {
          display: "block",
          width: "16px",
          height: "16px",
          borderRadius: "50%",
          background: c.ink,
          boxShadow: `0 0 0 5px ${c.accentSoft}`,
        });
      } else {
        el.setAttribute("aria-label", from.kind === "outing" ? "Événement" : "Ville cherchée");
        Object.assign(el.style, {
          display: "grid",
          width: "30px",
          height: "30px",
          borderRadius: "9px",
          background: c.ink,
          placeItems: "center",
        });
        el.append(svgIcon(from.kind === "outing" ? "ticket" : "place", c.ground));
      }
      markers.current.push(new maplibre.Marker({ element: el }).setLngLat([from.at.lng, from.at.lat]).addTo(map));
    }
    const padLat = ((zone.north - zone.south) * 20) / h;
    const padLng = ((zone.east - zone.west) * 20) / w;
    const visible = all.filter((p) => zoneContains(zone, p, padLat, padLng));
    const picked = visible.find((p) => p.id === sel) ?? null;
    const groups = clusterPins(
      visible.filter((p) => p.id !== picked?.id),
      Math.round(zoom),
    );
    const circle = (on: boolean) => ({
      width: "34px",
      height: "34px",
      borderRadius: "50%",
      display: "grid",
      placeItems: "center",
      padding: "0",
      cursor: "pointer",
      border: on ? "0" : `2px solid ${c.ink}`,
      background: on ? c.accent : c.surface,
    });
    for (const g of groups) {
      const el = document.createElement("button");
      el.type = "button";
      if (g.items.length > 1) {
        const stacked = isStacked(g, zoom);
        el.setAttribute("aria-label", L.groupAria(g.items.length, stacked));
        el.dataset.testid = "practical-group";
        Object.assign(el.style, {
          ...circle(false),
          background: c.mapRoad,
          color: c.mapLand,
          border: "0",
          font: `700 ${tokens.type.label.fontSize}px/1 inherit`,
        });
        el.textContent = String(g.items.length);
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          if (stacked) group(g.items.map((p) => p.id));
          else {
            const target = fitView(g.items, w, h, { maxZoom: GROUP_MAX_ZOOM });
            map.flyTo({
              center: [target.lng, target.lat],
              zoom: target.zoom,
              duration: latest.current.reducedMotion ? 0 : 420,
            });
          }
        });
      } else {
        const p = g.items[0] as PracticalPin;
        el.setAttribute("aria-label", p.title);
        el.dataset.testid = `practical-pin-${p.id}`;
        Object.assign(el.style, circle(false));
        el.append(svgIcon(iconOf(p.kind), c.ink));
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
      el.setAttribute("aria-label", picked.title);
      el.setAttribute("aria-pressed", "true");
      el.dataset.testid = `practical-pin-${picked.id}`;
      Object.assign(el.style, circle(true));
      el.append(svgIcon(iconOf(picked.kind), c.accentInk));
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        select(picked.id);
      });
      const marker = new maplibre.Marker({ element: el }).setLngLat([picked.lng, picked.lat]).addTo(map);
      marker.getElement().style.zIndex = "2";
      markers.current.push(marker);
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: la carte est créée une fois ; les épingles suivent plus bas.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mod = (await import("maplibre-gl")) as MapLibre & { default?: MapLibre };
      const maplibre = mod.Map ? mod : mod.default;
      if (!maplibre || cancelled || !box.current) return;
      if (!maplibre.getWorkerUrl?.()?.startsWith("https://"))
        maplibre.setWorkerUrl(
          `https://cdn.jsdelivr.net/npm/maplibre-gl@${maplibre.getVersion()}/dist/maplibre-gl-worker.mjs`,
        );
      const created = createOrassoMap(maplibre, box.current, {
        theme: themeRef.current,
        glyphsOrigin: mapGlyphsOrigin(),
        tilesUrl: mapTilesUrl(),
        center: [initial.lng, initial.lat],
        zoom: initial.zoom,
      });
      quietAttribution(created.map, box.current);
      handle.current = created;
      lib.current = maplibre;
      const seen = () => {
        const b = created.map.getBounds();
        latest.current.onView(
          { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() },
          created.map.getZoom(),
        );
      };
      // Chaque geste fini dit sa vue ; les épingles et le voile suivent la vue (pastilles recalculées à chaque zoom).
      created.map.on("moveend", () => {
        seen();
        draw();
        drawVeil();
      });
      // Un changement de thème remplace le style : le voile est reposé.
      created.map.on("styledata", () => drawVeil());
      created.map.on("load", () => {
        seen();
        draw();
        drawVeil();
      });
      // Avant le premier chargement du style : la vue de départ est connue par le calcul.
      const { w, h } = size();
      latest.current.onView(viewZone(initial, w, h), initial.zoom);
      draw();
    })().catch((e: unknown) => console.error("[carte] la carte n'a pas pu s'afficher", e));
    return () => {
      cancelled = true;
      for (const m of markers.current) m.remove();
      markers.current = [];
      handle.current?.map.remove();
      handle.current = null;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `draw` lit les dernières valeurs par `latest`.
  useEffect(() => {
    draw();
    drawVeil();
  }, [pins, origin, selectedId, theme, cover]);

  // Un ordre à la caméra : aller à une vue, ou cadrer des lieux.
  // biome-ignore lint/correctness/useExhaustiveDependencies: un ordre par numéro.
  useEffect(() => {
    const created = handle.current;
    if (!command || !created || command.seq === lastSeq.current) return;
    lastSeq.current = command.seq;
    const { w, h } = size();
    const target = "view" in command ? command.view : fitView(command.fit, w, h);
    created.map.flyTo({
      center: [target.lng, target.lat],
      zoom: target.zoom,
      duration: reducedMotion ? 0 : 420,
    });
  }, [command]);

  useEffect(() => {
    handle.current?.setTheme(theme);
  }, [theme]);

  return (
    <View
      style={[styles.map, height ? { height } : styles.fill, { borderRadius: tokens.radius.radiusLg }]}
      testID="practical-map"
    >
      <section
        ref={box}
        aria-label={L.mapLabel}
        data-testid="practical-map-canvas"
        style={{ position: "absolute", inset: 0, ...(mapCssVars(theme) as Record<string, string>) }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  map: { overflow: "hidden" },
  fill: { flex: 1 },
});
