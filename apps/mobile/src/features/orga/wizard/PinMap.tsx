// Carte à épingle de l'assistant sur téléphone (lot 53) : MapLibre natif au style Orasso (comme l'Explorer, lot 44),
// épingle moutarde fixe au centre, la carte glisse dessous ; à chaque arrêt après un geste, le centre devient la position
// de l'événement (« Déplace l'épingle pour viser l'entrée exacte ») ; jamais à l'ouverture ni quand la carte se recentre
// seule sur l'adresse trouvée (relecture du lot 53 ; à vérifier sur l'APK au lot 58). Le rendu navigateur est dans `PinMap.web.tsx`.
import { Camera, type CameraRef, Map as MapView, type ViewStateChangeEvent } from "@maplibre/maplibre-react-native";
import { chooseMapStyle, tokens, useTheme } from "@orasso/design-system/native";
import { useEffect, useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { mapGlyphsOrigin, mapTilesUrl } from "@/features/explorer/mapPins";
import { useTabSwipeDisabled } from "@/features/nav/useTabSwipe";
import { DEFAULT_PIN, type PinMapProps, pinFromRegion, type RegionChange } from "./pinMapTypes";

export function PinMap({ lat, lng, onMove, label }: PinMapProps) {
  const { theme, t } = useTheme();
  useTabSwipeDisabled();
  const camera = useRef<CameraRef>(null);
  // Un geste de l'utilisateur a commencé le mouvement en cours (seul un geste pose une position).
  const gesture = useRef(false);
  const last = useRef<{ lat: number; lng: number } | null>(lat !== null && lng !== null ? { lat, lng } : null);
  const style = useMemo(
    () => chooseMapStyle(theme, { glyphsOrigin: mapGlyphsOrigin(), tilesUrl: mapTilesUrl() }, true),
    [theme],
  );
  // Une position venue d'ailleurs (adresse trouvée) recentre la carte.
  useEffect(() => {
    if (lat === null || lng === null) return;
    const l = last.current;
    if (l && Math.abs(l.lat - lat) < 1e-6 && Math.abs(l.lng - lng) < 1e-6) return;
    last.current = { lat, lng };
    camera.current?.flyTo({ center: [lng, lat], zoom: 15 });
  }, [lat, lng]);

  return (
    <View style={[styles.map, { borderColor: t.color.line }]} testID="wizard-map" accessibilityLabel={label}>
      <MapView
        style={StyleSheet.absoluteFill}
        mapStyle={style as never}
        logo={false}
        attribution
        touchRotate={false}
        touchPitch={false}
        onRegionWillChange={(e: { nativeEvent: ViewStateChangeEvent }) => {
          gesture.current = Boolean(e.nativeEvent.userInteraction);
        }}
        onRegionDidChange={(e: { nativeEvent: ViewStateChangeEvent }) => {
          const pos = pinFromRegion(e.nativeEvent as unknown as RegionChange, gesture.current);
          gesture.current = false;
          if (!pos) return;
          last.current = pos;
          onMove(pos.lat, pos.lng);
        }}
      >
        <Camera
          ref={camera}
          initialViewState={{
            center: [lng ?? DEFAULT_PIN.lng, lat ?? DEFAULT_PIN.lat],
            zoom: lat === null ? 9 : 15,
          }}
        />
      </MapView>
      <View pointerEvents="none" style={styles.pin}>
        <Svg width={46} height={58} viewBox="0 0 46 58">
          <Path
            d="M23 56S3 38 3 22a20 20 0 0 1 40 0c0 16-20 34-20 34z"
            fill={t.color.accent}
            stroke={t.color.accentInk}
            strokeWidth={2}
          />
          <Circle cx={23} cy={22} r={7} fill={t.color.accentInk} />
        </Svg>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { height: 300, borderRadius: tokens.radius.radiusMd, overflow: "hidden", borderWidth: 1 },
  // La pointe de l'épingle sur le centre de la carte.
  pin: { position: "absolute", left: "50%", top: "50%", marginLeft: -23, marginTop: -58 },
});
