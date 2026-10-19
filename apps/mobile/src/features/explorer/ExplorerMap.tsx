// Carte de l'Explorer sur téléphone (lot 29 ; lot 44 : style Orasso) : MapLibre natif au style du thème (terre en béton
// ou en sable, mer hachurée, noms en Archivo étroit), suivi en direct, sans rotation ni inclinaison ; étiquettes
// datées des événements, plaques des pros, pastilles des groupes, point « toi » (position de l'appareil, jamais
// envoyée par la carte). Si OpenFreeMap ne répond pas, repli sur les tuiles raster OpenStreetMap. Le rendu navigateur
// est dans `ExplorerMap.web.tsx` (MapLibre GL JS, même style).
import {
  Camera,
  type CameraRef,
  Images,
  Map as MapView,
  Marker,
  type ViewStateChangeEvent,
} from "@maplibre/maplibre-react-native";
import {
  ClusterPin,
  clusterPins,
  EventPin,
  hatchImageId,
  hatchPngDataUri,
  MePin,
  mapFallbackRaster,
  mapStyle,
  ProPin,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import { useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { useTabSwipeDisabled } from "@/features/nav/useTabSwipe";
import { type ExplorerMapProps, type MapPin, mapGlyphsOrigin, mapTilesUrl, pinsKey, viewFor } from "./mapPins";

const { space3 } = tokens.spacing;

/** Vrai : la carte s'affiche ici. */
export const mapSupported = true;

export function ExplorerMap({ pins, me, selectedId, onSelect, children }: ExplorerMapProps) {
  const { theme, t } = useTheme();
  const [zoom, setZoom] = useState<number>(() => {
    const v = viewFor(pins);
    return "zoom" in v ? v.zoom : 8;
  });
  const [fellBack, setFellBack] = useState(false);
  const camera = useRef<CameraRef>(null);
  // Lot 40 : la carte garde le geste horizontal (pas de glissement vers l'onglet voisin).
  useTabSwipeDisabled();
  const view = useMemo(() => viewFor(pins), [pins]);
  const style = useMemo(
    () =>
      fellBack
        ? mapFallbackRaster(theme)
        : mapStyle(theme, { glyphsOrigin: mapGlyphsOrigin(), tilesUrl: mapTilesUrl() }),
    [theme, fellBack],
  );
  const groups = useMemo(() => clusterPins(pins, Math.round(zoom)), [pins, zoom]);

  return (
    <View style={styles.wrap} testID="explorer-map">
      <View style={[styles.map, { borderColor: t.color.line }]}>
        {/* La clé remet la caméra sur les nouvelles épingles quand les filtres changent. */}
        <MapView
          key={pinsKey(pins)}
          style={StyleSheet.absoluteFill}
          mapStyle={style as never}
          logo={false}
          attribution
          touchRotate={false}
          touchPitch={false}
          onRegionDidChange={(e: { nativeEvent: ViewStateChangeEvent }) => setZoom(e.nativeEvent.zoom)}
          onDidFailLoadingMap={() => {
            if (!fellBack) {
              console.warn("[carte] tuiles vectorielles indisponibles : repli raster OSM");
              setFellBack(true);
            }
          }}
        >
          <Images images={{ [hatchImageId(theme)]: hatchPngDataUri(theme) }} />
          <Camera
            ref={camera}
            initialViewState={
              "bounds" in view ? { bounds: view.bounds, padding: { top: 48, right: 48, bottom: 48, left: 48 } } : view
            }
          />
          {groups.map((g) => {
            const first = g.items[0] as MapPin;
            return (
              <Marker key={g.id} id={g.id} lngLat={[g.lng, g.lat]} anchor="bottom">
                {g.items.length > 1 ? (
                  <ClusterPin
                    count={g.items.length}
                    onPress={() => camera.current?.flyTo({ center: [g.lng, g.lat], zoom: Math.min(zoom + 2, 16) })}
                  />
                ) : first.kind === "pro" ? (
                  <ProPin label={first.label} accessibilityLabel={first.title} onPress={() => onSelect(first)} />
                ) : (
                  <EventPin
                    label={first.label}
                    hot={first.id === selectedId}
                    accessibilityLabel={first.title}
                    onPress={() => onSelect(first)}
                  />
                )}
              </Marker>
            );
          })}
          {me ? (
            <Marker id="me" lngLat={[me.lng, me.lat]}>
              <MePin />
            </Marker>
          ) : null}
        </MapView>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space3 },
  map: { height: 420, borderRadius: tokens.radius.radiusMd, overflow: "hidden", borderWidth: 1 },
});
