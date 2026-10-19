// Tirer pour actualiser (lot 39) : en haut d'une liste, on tire vers le bas ; le geste est celui du système
// (RefreshControl, qui ne perd jamais face au défilement natif), mais son indicateur est rendu invisible : c'est le O
// vivant qui descend au-dessus de la liste, la voiture drifte le temps de recharger puis se gare, et la liste remonte.
// Jamais la roue du système. Réduction des animations : le O garé apparaît en fondu, sans drift.
//
//   const refresh = useOliveRefresh(() => reload());
//   <PullToRefresh state={refresh}>
//     <ScrollView refreshControl={refresh.refreshControl}>…</ScrollView>
//   </PullToRefresh>

import { type ReactElement, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, RefreshControl, type RefreshControlProps, StyleSheet, View } from "react-native";
import Animated, { type SharedValue, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { duration, easings } from "../motionHooks";
import { OLoader } from "./OLoader";

/** Hauteur de la zone du O pendant l'actualisation, en px. */
const ZONE = 76;
/** Android : l'indicateur du système est poussé hors de l'écran (le O le remplace). */
const HIDDEN_OFFSET = -1000;
const INVISIBLE = "transparent";

export type OliveRefresh = {
  /** Actualisation en cours (la voiture drifte). */
  refreshing: boolean;
  /** Fin de l'actualisation : la voiture se gare (puis la zone se referme). */
  settling: boolean;
  /** Descente du O, 0 → 1. */
  pull: SharedValue<number>;
  /** À passer au `refreshControl` du ScrollView / de la FlatList : le geste du système, sans sa roue. */
  refreshControl: ReactElement<RefreshControlProps>;
  /** Lance l'actualisation sans geste (bouton « Actualiser », recette). */
  trigger: () => void;
  /** Interne : la voiture est garée, la zone se referme. */
  onParked: () => void;
};

/** L'état d'une actualisation par le O vivant : `onRefresh` peut renvoyer une promesse (la voiture drifte jusqu'au bout). */
export function useOliveRefresh(onRefresh: () => unknown | Promise<unknown>): OliveRefresh {
  const [refreshing, setRefreshing] = useState(false);
  const [settling, setSettling] = useState(false);
  const pull = useSharedValue(0);
  const busy = useRef(false);
  const run = useRef(onRefresh);
  run.current = onRefresh;
  const closing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
      if (closing.current) clearTimeout(closing.current);
    },
    [],
  );

  const trigger = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    setSettling(false);
    setRefreshing(true);
    pull.value = withTiming(1, { duration: duration.base, easing: easings.park });
    void Promise.resolve()
      .then(() => run.current())
      .catch(() => undefined)
      .finally(() => {
        if (mounted.current) setSettling(true);
      });
  }, [pull]);

  const onParked = useCallback(() => {
    pull.value = withTiming(0, { duration: duration.base, easing: easings.inout });
    if (closing.current) clearTimeout(closing.current);
    closing.current = setTimeout(() => {
      busy.current = false;
      setRefreshing(false);
      setSettling(false);
    }, duration.base);
  }, [pull]);

  // Le contrôle du système ne montre jamais sa roue : `refreshing` reste faux (le O fait l'attente).
  const refreshControl = useMemo(
    () => (
      <RefreshControl
        refreshing={false}
        onRefresh={trigger}
        tintColor={INVISIBLE}
        colors={[INVISIBLE]}
        progressBackgroundColor={INVISIBLE}
        progressViewOffset={Platform.OS === "android" ? HIDDEN_OFFSET : undefined}
      />
    ),
    [trigger],
  );

  return useMemo(
    () => ({ refreshing, settling, pull, refreshControl, trigger, onParked }),
    [refreshing, settling, pull, refreshControl, trigger, onParked],
  );
}

export type PullToRefreshProps = {
  state: OliveRefresh;
  children: ReactNode;
  /** Écran hors focus : la voiture s'arrête. */
  paused?: boolean;
};

/** Le conteneur de la liste : pendant l'actualisation, le O descend au-dessus et la liste suit. */
export function PullToRefresh({ state, children, paused }: PullToRefreshProps) {
  const { pull } = state;
  const zoneStyle = useAnimatedStyle(() => {
    "worklet";
    return { height: pull.value * ZONE, opacity: Math.min(1, pull.value * 1.4) };
  });
  const listStyle = useAnimatedStyle(() => {
    "worklet";
    return { transform: [{ translateY: pull.value * ZONE }] };
  });
  return (
    <View style={styles.root}>
      <Animated.View pointerEvents="none" style={[styles.zone, zoneStyle]}>
        {state.refreshing && (
          <OLoader
            size={48}
            done={state.settling}
            onParked={state.onParked}
            paused={paused}
            label={state.settling ? null : "Actualisation en cours"}
          />
        )}
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
