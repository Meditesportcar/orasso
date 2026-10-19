// Marqueurs de la carte Orasso dans l'appli native (lot 44, prototype `s-map`) : le dessin seul, que l'appli pose
// dans un `Marker` de MapLibre natif (une vue React Native qui suit un point). Étiquette inclinée datée (événement),
// pastille avec le nombre (groupe), plaque (pro), point bleu (toi). Couleurs : jetons du thème, rien en dur.
import { Pressable, Text, View } from "react-native";

import { withAlpha } from "../native/color";
import { archivoFamily } from "../native/fontFamily";
import { radius, useTheme } from "../native/theme";

const narrow = archivoFamily("narrow", 800, false);
/** Zone de toucher minimale (44 px, README). */
const HIT = 44;

type PinPress = { onPress?: () => void; accessibilityLabel: string; testID?: string };

/** Événement : étiquette inclinée avec la date (« SAM 24 ») ; `hot` = sélectionné (moutarde). */
export function EventPin({
  label,
  hot,
  onPress,
  accessibilityLabel,
  testID = "map-pin",
}: PinPress & {
  label: string;
  hot?: boolean;
}) {
  const { t } = useTheme();
  const bg = hot ? t.color.accent : t.color.mapRoad;
  const ink = hot ? t.color.accentInk : t.color.mapLand;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={{ minWidth: HIT, minHeight: HIT, alignItems: "center", justifyContent: "flex-end" }}
    >
      <View
        style={{
          backgroundColor: bg,
          borderRadius: 3,
          paddingHorizontal: 7,
          paddingVertical: 4,
          transform: [{ skewX: "-10deg" }],
        }}
      >
        <Text style={{ fontFamily: narrow, fontSize: 11, letterSpacing: 0.5, color: ink }}>{label}</Text>
      </View>
      <View
        style={{
          width: 0,
          height: 0,
          borderLeftWidth: 5,
          borderRightWidth: 5,
          borderTopWidth: 7,
          borderLeftColor: "transparent",
          borderRightColor: "transparent",
          borderTopColor: bg,
        }}
      />
    </Pressable>
  );
}

/** Groupe : pastille avec le nombre ; la toucher rapproche. */
export function ClusterPin({
  count,
  onPress,
  testID = "map-cluster",
}: {
  count: number;
  onPress?: () => void;
  testID?: string;
}) {
  const { t } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${count} lieux : zoomer`}
      testID={testID}
      style={{ width: HIT, height: HIT, alignItems: "center", justifyContent: "center" }}
    >
      <View
        style={{
          width: 30,
          height: 30,
          borderRadius: radius.radiusPill,
          backgroundColor: t.color.mapRoad,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={{ fontFamily: narrow, fontSize: 13, color: t.color.mapLand }}>{count}</Text>
      </View>
    </Pressable>
  );
}

/** Pro : plaque avec son nom (jamais tronqué). */
export function ProPin({ label, onPress, accessibilityLabel, testID = "map-pin" }: PinPress & { label: string }) {
  const { t } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={{ minHeight: HIT, alignItems: "center", justifyContent: "center" }}
    >
      <View
        style={{
          minHeight: 28,
          paddingHorizontal: 9,
          justifyContent: "center",
          borderRadius: radius.radiusSm,
          borderWidth: 1.5,
          borderColor: t.color.mapRoad,
          backgroundColor: t.color.night,
        }}
      >
        <Text style={{ fontFamily: narrow, fontSize: 11, letterSpacing: 0.5, color: t.color.nightInk }}>
          {label.toUpperCase()}
        </Text>
      </View>
    </Pressable>
  );
}

/** Toi : point bleu cerclé (la position n'est montrée qu'à toi, jamais envoyée). */
export function MePin() {
  const { t } = useTheme();
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Ta position"
      style={{
        width: 28,
        height: 28,
        borderRadius: radius.radiusPill,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: withAlpha(t.color.statusWaitlist, 0.3),
      }}
    >
      <View
        style={{
          width: 14,
          height: 14,
          borderRadius: radius.radiusPill,
          borderWidth: 2,
          borderColor: t.color.mapLand,
          backgroundColor: t.color.statusWaitlist,
        }}
      />
    </View>
  );
}
