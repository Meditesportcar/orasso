// La carte du lieu d'un rendez-vous (MapLibre, style Orasso, comme l'Explorer) : une seule épingle, le lieu exact, servi à
// l'auteur et aux invités seulement. La carte de l'Explorer porte le rendu (téléphone et navigateur) ; ici, un cadre de
// hauteur fixe et le toucher ne fait rien.
import { tokens, useTheme } from "@orasso/design-system/native";
import { spotLabels as L } from "@orasso/shared";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";

import { ExplorerMap } from "@/features/explorer/ExplorerMap";
import type { MapPin } from "@/features/explorer/mapPins";

/** Zoom de rue : le point exact, pas la ville. */
const SPOT_MAP_ZOOM = 16;

export function SpotPlaceMap({
  id,
  label,
  lat,
  lng,
  height = 220,
}: {
  id: string;
  label: string;
  lat: number;
  lng: number;
  height?: number;
}) {
  const { t } = useTheme();
  const pins = useMemo<MapPin[]>(
    () => [{ id, kind: "event", label: "Ici", lat, lng, title: label, subtitle: "", href: "" }],
    [id, label, lat, lng],
  );
  return (
    <View
      style={[styles.frame, { height, borderColor: t.color.line }]}
      accessibilityLabel={`${L.feature} : ${label}`}
      testID="spot-map"
    >
      <ExplorerMap pins={pins} onSelect={() => undefined} reveal={false} fill zoom={SPOT_MAP_ZOOM} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: tokens.radius.radiusMd, overflow: "hidden", borderWidth: 1 },
});
