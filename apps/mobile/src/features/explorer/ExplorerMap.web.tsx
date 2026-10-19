// Carte de l'Explorer dans un navigateur (recette de l'appli, react-native-web ; lot 44) : MapLibre GL JS au même style
// Orasso que le téléphone et le site (thème suivi en direct, sans rotation, repli raster), mêmes marqueurs. Aucune
// importation de `@maplibre/maplibre-react-native` ici : le module natif ne se charge pas dans un navigateur.
import "maplibre-gl/dist/maplibre-gl.css";
import "@orasso/design-system/map/map.css";
import { createOrassoMap, mapCssVars, type OrassoMap, placePins, type WebPin } from "@orasso/design-system/map/web";
import { tokens, useTheme } from "@orasso/design-system/native";
import { explorerV2Labels } from "@orasso/shared";
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";

import { type ExplorerMapProps, type MapPin, mapGlyphsOrigin, mapTilesUrl, viewFor } from "./mapPins";

const { space3 } = tokens.spacing;
type MapLibre = typeof import("maplibre-gl");

/** Vrai : la carte s'affiche aussi dans un navigateur. */
export const mapSupported = true;

export function ExplorerMap({ pins, me, onSelect, children }: ExplorerMapProps) {
  const { theme, t } = useTheme();
  const box = useRef<HTMLElement | null>(null);
  const handle = useRef<OrassoMap | null>(null);
  const placed = useRef<ReturnType<typeof placePins> | null>(null);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const byId = useRef(new Map<string, MapPin>());
  const latest = useRef({ pins, me });
  latest.current = { pins, me };

  const webPins = (list: MapPin[]): WebPin[] => [
    ...list.map((p) => ({ id: p.id, kind: p.kind, lat: p.lat, lng: p.lng, label: p.label, title: p.title })),
    ...(me ? [{ id: "me", kind: "me" as const, lat: me.lat, lng: me.lng, label: "", title: "Ta position" }] : []),
  ];

  // biome-ignore lint/correctness/useExhaustiveDependencies: la carte est créée une fois ; les épingles suivent plus bas.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Metro charge le paquet UMD de MapLibre : selon l'interopérabilité, l'API est à la racine ou sous `default`.
      const mod = (await import("maplibre-gl")) as MapLibre & { default?: MapLibre };
      const maplibre = mod.Map ? mod : mod.default;
      if (!maplibre || cancelled || !box.current) return;
      // Metro ne sait pas servir le fil de travail de MapLibre (`new URL(…, import.meta.url)`) : on donne celui de la même
      // version, que MapLibre télécharge et charge lui-même (recette web de l'appli seulement ; le natif n'en a pas besoin).
      if (!maplibre.getWorkerUrl?.()?.startsWith("https://"))
        maplibre.setWorkerUrl(`https://cdn.jsdelivr.net/npm/maplibre-gl@${maplibre.getVersion()}/dist/maplibre-gl-worker.mjs`);
      const view = viewFor(latest.current.pins);
      const created = createOrassoMap(maplibre, box.current, {
        theme: themeRef.current,
        glyphsOrigin: mapGlyphsOrigin(),
        tilesUrl: mapTilesUrl(),
        ...("center" in view ? { center: view.center, zoom: view.zoom } : {}),
      });
      if ("bounds" in view) created.map.fitBounds(view.bounds, { padding: 48, maxZoom: 11, duration: 0 });
      handle.current = created;
      placed.current = placePins(maplibre, created.map, webPins(latest.current.pins), {
        onSelect: (pin) => {
          const p = byId.current.get(pin.id);
          if (p) onSelectRef.current(p);
        },
      });
    })().catch((e: unknown) => console.error("[carte] la carte n'a pas pu s'afficher", e));
    return () => {
      cancelled = true;
      placed.current?.remove();
      handle.current?.map.remove();
      handle.current = null;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `webPins` dépend seulement de `pins` et `me`.
  useEffect(() => {
    byId.current = new Map(pins.map((p) => [p.id, p]));
    placed.current?.update(webPins(pins));
  }, [pins, me]);

  useEffect(() => {
    handle.current?.setTheme(theme);
  }, [theme]);

  return (
    <View style={styles.wrap} testID="explorer-map">
      <View style={[styles.map, { borderColor: t.color.line }]}>
        <section
          ref={box}
          aria-label={explorerV2Labels.mapLabel}
          data-testid="explorer-map-canvas"
          style={{ position: "absolute", inset: 0, ...(mapCssVars(theme) as Record<string, string>) }}
        />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space3 },
  map: { height: 420, borderRadius: tokens.radius.radiusMd, overflow: "hidden", borderWidth: 1 },
});
