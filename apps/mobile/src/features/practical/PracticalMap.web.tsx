// Carte de « Pratique » dans un navigateur (recette de l'appli, react-native-web ; lot R8q) : MapLibre GL JS au même style Orasso que
// le téléphone (thème suivi en direct, sans rotation, repli raster), mêmes épingles. Aucune importation de
// `@maplibre/maplibre-react-native` ici : le module natif ne se charge pas dans un navigateur.
import "maplibre-gl/dist/maplibre-gl.css";
import "@orasso/design-system/map/map.css";
import { type IconName, iconShapes } from "@orasso/design-system";
import { createOrassoMap, mapCssVars, type OrassoMap } from "@orasso/design-system/map/web";
import { tokens, useTheme } from "@orasso/design-system/native";
import { practicalTexts as L } from "@orasso/shared";
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";

import { mapGlyphsOrigin, mapTilesUrl, viewFor } from "@/features/explorer/mapPins";
import { quietAttribution } from "@/features/explorer/quietAttribution";
import type { PracticalMapProps, PracticalPin } from "./mapTypes";

type MapLibre = typeof import("maplibre-gl");

/** Vrai : la carte s'affiche aussi dans un navigateur. */
export const mapSupported = true;

const SVG_NS = "http://www.w3.org/2000/svg";
const iconOf = (kind: PracticalPin["kind"]): IconName => (kind === "fuel" ? "power" : "drop");

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

const framedPoints = (pins: readonly PracticalPin[], origin: PracticalMapProps["origin"]) => [
  ...pins,
  ...(origin ? [{ lat: origin.at.lat, lng: origin.at.lng }] : []),
];
const signatureOf = (pins: readonly PracticalPin[], origin: PracticalMapProps["origin"]) =>
  `${origin?.kind}:${origin?.at.lat},${origin?.at.lng}|${pins.map((p) => p.id).join(",")}`;

export function PracticalMap({ pins, origin, selectedId, onSelect, height }: PracticalMapProps) {
  const { theme } = useTheme();
  const box = useRef<HTMLElement | null>(null);
  const handle = useRef<OrassoMap | null>(null);
  const lib = useRef<MapLibre | null>(null);
  const markers = useRef<{ remove: () => void }[]>([]);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const latest = useRef({ pins, origin, selectedId });
  latest.current = { pins, origin, selectedId };
  const framed = useRef("");

  // Pose les épingles : mon point ou l'événement, puis une épingle par lieu.
  const draw = () => {
    const maplibre = lib.current;
    const created = handle.current;
    if (!maplibre || !created) return;
    const c = tokens.color[themeRef.current];
    for (const m of markers.current) m.remove();
    markers.current = [];
    const { pins: list, origin: from, selectedId: sel } = latest.current;
    if (from) {
      const el = document.createElement("span");
      el.setAttribute("role", "img");
      el.dataset.testid = from.kind === "me" ? "practical-me" : "practical-event";
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
        el.setAttribute("aria-label", "Événement");
        Object.assign(el.style, {
          display: "grid",
          width: "30px",
          height: "30px",
          borderRadius: "9px",
          background: c.ink,
          placeItems: "center",
        });
        el.append(svgIcon("ticket", c.ground));
      }
      markers.current.push(
        new maplibre.Marker({ element: el }).setLngLat([from.at.lng, from.at.lat]).addTo(created.map),
      );
    }
    for (const p of list) {
      const on = p.id === sel;
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", p.title);
      el.setAttribute("aria-pressed", String(on));
      el.dataset.testid = `practical-pin-${p.id}`;
      Object.assign(el.style, {
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
      el.append(svgIcon(iconOf(p.kind), on ? c.accentInk : c.ink));
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelectRef.current(p.id);
      });
      const marker = new maplibre.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(created.map);
      if (on) marker.getElement().style.zIndex = "2";
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
      const view = viewFor(framedPoints(latest.current.pins, latest.current.origin), 12);
      const created = createOrassoMap(maplibre, box.current, {
        theme: themeRef.current,
        glyphsOrigin: mapGlyphsOrigin(),
        tilesUrl: mapTilesUrl(),
        ...("center" in view ? { center: view.center, zoom: view.zoom } : {}),
      });
      quietAttribution(created.map, box.current);
      if ("bounds" in view) created.map.fitBounds(view.bounds, { padding: 48, maxZoom: 13, duration: 0 });
      handle.current = created;
      lib.current = maplibre;
      framed.current = signatureOf(latest.current.pins, latest.current.origin);
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
    const created = handle.current;
    const signature = signatureOf(pins, origin);
    // Les lieux ont changé (filtre, autre origine) : la carte se recadre ; une sélection seule ne bouge rien.
    if (created && signature !== framed.current) {
      framed.current = signature;
      const view = viewFor(framedPoints(pins, origin), 12);
      if ("bounds" in view) created.map.fitBounds(view.bounds, { padding: 48, maxZoom: 13, duration: 0 });
      else created.map.jumpTo({ center: view.center, zoom: view.zoom });
    }
  }, [pins, origin, selectedId, theme]);

  useEffect(() => {
    handle.current?.setTheme(theme);
  }, [theme]);

  return (
    <View style={[styles.map, { height, borderRadius: tokens.radius.radiusLg }]} testID="practical-map">
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
});
