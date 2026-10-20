// Logo de la structure avec son sceau (DA v2, lot 52, prototype `s-ostruct`) : quand la structure est validée, un anneau
// en tirets tourne lentement autour du logo (Reanimated, un tour en 24 s) et une pastille au O marque le coin. L'anneau
// s'arrête quand la réduction des animations est demandée. Non validée : le logo seul, sans anneau ni pastille.
import { Icon, tokens, useTheme } from "@orasso/design-system/native";
import { orgaV2Labels } from "@orasso/shared";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { Avatar } from "@/ui/Avatar";

const { radiusPill } = tokens.radius;
/** Un tour du sceau. */
export const SEAL_TURN_MS = 24_000;

export function SealedLogo({
  url,
  name,
  verified,
  size = 76,
}: {
  url: string | null;
  name: string;
  verified: boolean;
  size?: number;
}) {
  const { t, reducedMotion } = useTheme();
  const turn = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(turn);
    turn.value = 0;
    if (verified && !reducedMotion) {
      turn.value = withRepeat(withTiming(1, { duration: SEAL_TURN_MS, easing: Easing.linear }), -1, false);
    }
    return () => cancelAnimation(turn);
  }, [verified, reducedMotion, turn]);
  const ring = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 360}deg` }] }));
  const outer = size + 18;
  return (
    <View style={{ width: outer, height: outer }} testID="structure-logo">
      <View style={[styles.center, { width: outer, height: outer }]}>
        <Avatar url={url} pseudo={name} size={size} />
      </View>
      {verified ? (
        <>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ring,
              { width: outer, height: outer, borderColor: t.color.accent, borderRadius: radiusPill },
              ring,
            ]}
            testID="structure-seal"
            accessibilityLabel={orgaV2Labels.structVerifiedSeal}
          />
          <View
            style={[styles.pastille, { backgroundColor: t.color.accent, borderColor: t.color.ground }]}
            testID="structure-o"
            accessibilityElementsHidden
          >
            <Icon name="o" size={16} color={t.color.accentInk} />
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { position: "absolute", alignItems: "center", justifyContent: "center" },
  ring: { position: "absolute", borderWidth: 2, borderStyle: "dashed" },
  pastille: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: radiusPill,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
