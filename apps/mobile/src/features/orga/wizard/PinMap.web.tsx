// Carte à épingle de l'assistant dans un navigateur (recette de l'appli, lot 53) : MapLibre GL JS au style Orasso,
// une épingle moutarde à glisser, ou un toucher sur la carte pour la poser. Même rôle que `PinMap.tsx` sur le téléphone.
import "maplibre-gl/dist/maplibre-gl.css";
import "@orasso/design-system/map/map.css";
import { createOrassoMap, mapCssVars, type OrassoMap } from "@orasso/design-system/map/web";
import { tokens, useTheme } from "@orasso/design-system/native";
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";

import { mapGlyphsOrigin, mapTilesUrl } from "@/features/explorer/mapPins";
import { DEFAULT_PIN, type PinMapProps } from "./pinMapTypes";

type MapLibre = typeof import("maplibre-gl");

export function PinMap({ lat, lng, onMove, label }: PinMapProps) {
  const { theme, t } = useTheme();
  const box = useRef<HTMLElement | null>(null);
  const handle = useRef<OrassoMap | null>(null);
  const marker = useRef<import("maplibre-gl").Marker | null>(null);
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  const start = useRef({ lat: lat ?? DEFAULT_PIN.lat, lng: lng ?? DEFAULT_PIN.lng, zoom: lat === null ? 9 : 15 });
  const themeRef = useRef(theme);
  themeRef.current = theme;

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
      const s = start.current;
      const created = createOrassoMap(maplibre, box.current, {
        theme: themeRef.current,
        glyphsOrigin: mapGlyphsOrigin(),
        tilesUrl: mapTilesUrl(),
        center: [s.lng, s.lat],
        zoom: s.zoom,
      });
      handle.current = created;
      const el = document.createElement("div");
      el.setAttribute("data-testid", "wizard-pin");
      el.style.width = "46px";
      el.style.height = "58px";
      el.style.cursor = "grab";
      el.innerHTML = `<svg viewBox="0 0 46 58" width="46" height="58" aria-hidden="true"><path d="M23 56S3 38 3 22a20 20 0 0 1 40 0c0 16-20 34-20 34z" fill="${t.color.accent}" stroke="${t.color.accentInk}" stroke-width="2"/><circle cx="23" cy="22" r="7" fill="${t.color.accentInk}"/></svg>`;
      const m = new maplibre.Marker({ element: el, draggable: true, anchor: "bottom" })
        .setLngLat([s.lng, s.lat])
        .addTo(created.map);
      m.on("dragend", () => {
        const p = m.getLngLat();
        moveRef.current(p.lat, p.lng);
      });
      created.map.on("click", (e) => {
        m.setLngLat(e.lngLat);
        moveRef.current(e.lngLat.lat, e.lngLat.lng);
      });
      marker.current = m;
    })().catch((e: unknown) => console.error("[carte] la carte n'a pas pu s'afficher", e));
    return () => {
      cancelled = true;
      marker.current?.remove();
      handle.current?.map.remove();
      handle.current = null;
    };
  }, [t.color.accent, t.color.accentInk]);

  // Une position venue d'ailleurs (adresse trouvée) déplace l'épingle et la vue.
  useEffect(() => {
    if (lat === null || lng === null || !marker.current) return;
    const at = marker.current.getLngLat();
    if (Math.abs(at.lat - lat) < 1e-7 && Math.abs(at.lng - lng) < 1e-7) return;
    marker.current.setLngLat([lng, lat]);
    handle.current?.map.jumpTo({ center: [lng, lat], zoom: 15 });
  }, [lat, lng]);

  useEffect(() => {
    handle.current?.setTheme(theme);
  }, [theme]);

  return (
    <View style={[styles.map, { borderColor: t.color.line }]} testID="wizard-map">
      <section
        ref={box}
        aria-label={label}
        data-testid="wizard-map-canvas"
        style={{ position: "absolute", inset: 0, ...(mapCssVars(theme) as Record<string, string>) }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  map: { height: 300, borderRadius: tokens.radius.radiusMd, overflow: "hidden", borderWidth: 1 },
});
