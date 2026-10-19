// Tirer pour actualiser (lot 39) : en haut d'une liste, on tire vers le bas, le O descend ; au-delà de 64 px on lâche, la
// voiture drifte le temps de recharger puis se gare, et la liste remonte. Réduction des animations : le O garé apparaît
// en fondu, sans drift.
//
//   const refresh = useOliveRefresh(() => reload());
//   <PullToRefresh state={refresh}>
//     <ScrollView onScroll={refresh.onScroll} scrollEventThrottle={16}>…</ScrollView>
//   </PullToRefresh>

import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { type NativeScrollEvent, type NativeSyntheticEvent, PanResponder, StyleSheet, View } from "react-native";
import Animated, { type SharedValue, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { olive } from "../../motion";
import { duration, easings } from "../motionHooks";
import { OLoader } from "./OLoader";

/** Hauteur de la zone du O pendant l'actualisation, en px. */
const ZONE = 76;
/** Le doigt tire, la liste suit à 55 % (résistance). */
const RESISTANCE = 0.55;
/** Seuil du geste vertical, en px, avant de prendre la main sur la liste. */
const SLOP = 6;

export type OliveRefresh = {
  /** Actualisation en cours (la voiture drifte). */
  refreshing: boolean;
  /** Fin de l'actualisation : la voiture se gare (puis la zone se referme). */
  settling: boolean;
  /** Descente du O, 0 → 1 (1 = seuil atteint). */
  pull: SharedValue<number>;
  /** À brancher sur la liste : on ne tire que tout en haut. */
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** Lance l'actualisation sans geste (bouton « Actualiser », recette). */
  trigger: () => void;
  /** Interne : la voiture est garée, la zone se referme. */
  onParked: () => void;
  /** Interne : vrai si la liste est tout en haut. */
  atTop: () => boolean;
};

/** L'état d'une actualisation par le O vivant : `onRefresh` peut renvoyer une promesse (la voiture drifte jusqu'au bout). */
export function useOliveRefresh(onRefresh: () => unknown | Promise<unknown>): OliveRefresh {
  const [refreshing, setRefreshing] = useState(false);
  const [settling, setSettling] = useState(false);
  const pull = useSharedValue(0);
  const top = useRef(true);
  const busy = useRef(false);
  const run = useRef(onRefresh);
  run.current = onRefresh;

  const trigger = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    setSettling(false);
    setRefreshing(true);
    pull.value = withTiming(1, { duration: duration.base, easing: easings.park });
    void Promise.resolve()
      .then(() => run.current())
      .catch(() => undefined)
      .finally(() => setSettling(true));
  }, [pull]);

  const onParked = useCallback(() => {
    pull.value = withTiming(0, { duration: duration.base, easing: easings.inout });
    setTimeout(() => {
      busy.current = false;
      setRefreshing(false);
      setSettling(false);
    }, duration.base);
  }, [pull]);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    top.current = event.nativeEvent.contentOffset.y <= 0;
  }, []);

  return useMemo(
    () => ({ refreshing, settling, pull, onScroll, trigger, onParked, atTop: () => top.current && !busy.current }),
    [refreshing, settling, pull, onScroll, trigger, onParked],
  );
}

export type PullToRefreshProps = {
  state: OliveRefresh;
  children: ReactNode;
  /** Écran hors focus : la voiture s'arrête. */
  paused?: boolean;
};

/** Le conteneur de la liste : le O descend au-dessus quand on tire, la liste suit. */
export function PullToRefresh({ state, children, paused }: PullToRefreshProps) {
  const { pull, trigger, atTop } = state;
  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => atTop() && g.dy > SLOP && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_, g) => {
          pull.value = Math.max(0, Math.min(1.2, (g.dy * RESISTANCE) / olive.pullDistance));
        },
        onPanResponderRelease: () => {
          if (pull.value >= 1) trigger();
          else pull.value = withTiming(0, { duration: duration.fast, easing: easings.inout });
        },
        onPanResponderTerminate: () => {
          pull.value = withTiming(0, { duration: duration.fast, easing: easings.inout });
        },
      }),
    [atTop, pull, trigger],
  );
  const zoneStyle = useAnimatedStyle(() => {
    "worklet";
    return { height: Math.min(1, pull.value) * ZONE, opacity: Math.min(1, pull.value * 1.4) };
  });
  const listStyle = useAnimatedStyle(() => {
    "worklet";
    return { transform: [{ translateY: Math.min(1.2, pull.value) * ZONE }] };
  });
  return (
    <View style={styles.root} {...responder.panHandlers}>
      <Animated.View pointerEvents="none" style={[styles.zone, zoneStyle]}>
        <OLoader size={48} done={state.settling} onParked={state.onParked} paused={paused || !state.refreshing} />
      </Animated.View>
      <Animated.View style={[styles.root, listStyle]}>{children}</Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  zone: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
