// L'onglet ouvert par un glissement se gare depuis le côté d'où il vient (24 px, `base`, courbe « park », README
// Motion) ; avec « Réduire les animations », il apparaît en fondu de 120 ms, sans glissement. Ouvert autrement (appui
// sur la barre), il s'affiche tel quel.
import { duration, easings, park, useTheme } from "@orasso/design-system/native";
import { useFocusEffect } from "expo-router";
import { type ReactNode, useCallback, useContext } from "react";
import { StyleSheet } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { TabSwipeContext } from "./useTabSwipe";

/** Un glissement plus vieux que ça n'est pas celui qui a ouvert l'écran. */
const RECENT_MS = 600;

export function SwipeEntry({ children }: { children: ReactNode }) {
  const control = useContext(TabSwipeContext);
  const { reducedMotion } = useTheme();
  const offset = useSharedValue(0);
  const opacity = useSharedValue(1);

  useFocusEffect(
    useCallback(() => {
      const swipe = control?.lastSwipe.current;
      if (!swipe || Date.now() - swipe.at > RECENT_MS) return;
      control.lastSwipe.current = null;
      if (reducedMotion) {
        opacity.value = 0;
        opacity.value = withTiming(1, { duration: duration.fast, easing: easings.linear });
        return;
      }
      offset.value = swipe.direction * park.screenFrom;
      offset.value = withTiming(0, { duration: duration.base, easing: easings.park });
    }, [control, reducedMotion, offset, opacity]),
  );

  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateX: offset.value }] }));
  return <Animated.View style={[styles.fill, style]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
