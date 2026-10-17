// La carte qui glisse (lot 23, ARCHITECTURE-SUITE § 7.3) : droite = Retenir, gauche = Refuser (feuille des motifs
// d'abord), haut = Liste d'attente. Seuil à 40 % de la largeur, retour élastique en dessous. Le doigt est suivi par un
// PanResponder (comme le curseur de l'appli : aucune dépendance native de plus, même geste dans le navigateur de la
// recette) qui écrit dans des valeurs partagées Reanimated ; translation, rotation et étiquettes sont calculées sur le
// fil d'interface par des styles animés, sans travail JS pendant le geste. Toute fonction appelée par un style animé
// porte `'worklet'` (`swipeProgress`, `swipeRotation` dans `lib/triage.ts`).
// Réduction des animations : la carte ne bouge pas, les étiquettes se fondent, la carte disparaît en fondu de 120 ms.
// Les trois boutons du bas restent l'alternative accessible ; un glissement qui a pris la main annule l'appui qui l'a
// commencé, donc jamais deux décisions pour un même geste.
import { duration, easings, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type TriageDecision, triageAppLabels } from "@orasso/shared";
import { type MutableRefObject, type ReactNode, useEffect, useMemo, useRef } from "react";
import { PanResponder, Platform, StyleSheet, View, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";

import {
  DIR_ACCEPT,
  DIR_REFUSE,
  DIR_WAITLIST,
  exitTarget,
  SWIPE_THRESHOLD_RATIO,
  swipeProgress,
  swipeRotation,
  swipeState,
} from "@/lib/triage";

const { space2, space3, space4 } = tokens.spacing;
const { radiusPill } = tokens.radius;

export type SwipeControl = {
  /** La carte part dans le sens de la décision, puis `onExited` (le refus ne part qu'après sa feuille de motifs). */
  exit: (decision: TriageDecision) => void;
  /** Refus : la feuille des motifs s'ouvre (la carte reste, rien n'est armé avant la confirmation). */
  refuse: () => void;
};

// Navigateur (recette) : pas de sélection de texte ni de défilement de la page pendant le glissement.
const webGuard = (Platform.OS === "web" ? { userSelect: "none", touchAction: "none" } : {}) as ViewStyle;

const SPRING = { damping: 18, stiffness: 220, mass: 0.9 } as const;

export function SwipeCard({
  children,
  disabled,
  controlRef,
  onExited,
  onRefuse,
  testID,
}: {
  children: ReactNode;
  disabled: boolean;
  controlRef: MutableRefObject<SwipeControl | null>;
  /** La carte a fini de sortir : le parent arme la décision. */
  onExited: (decision: TriageDecision) => void;
  onRefuse: () => void;
  testID?: string;
}) {
  const { t, reducedMotion } = useTheme();
  const gx = useSharedValue(0);
  const gy = useSharedValue(0);
  const fade = useSharedValue(0);
  const width = useSharedValue(320);
  const metrics = useRef({ w: 320, h: 480 });
  const leaving = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Valeurs lues par le PanResponder (créé une seule fois).
  const live = useRef({ disabled, reducedMotion, onExited, onRefuse });
  live.current = { disabled, reducedMotion, onExited, onRefuse };

  useEffect(() => {
    fade.value = withTiming(1, { duration: duration.fast, easing: easings.linear });
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [fade]);

  const springBack = () => {
    if (live.current.reducedMotion) {
      gx.value = 0;
      gy.value = 0;
    } else {
      gx.value = withSpring(0, SPRING);
      gy.value = withSpring(0, SPRING);
    }
  };

  const exit = (decision: TriageDecision) => {
    if (leaving.current) return;
    leaving.current = true;
    const reduced = live.current.reducedMotion;
    // Réduction des animations : aucune translation, la carte se fond en 120 ms.
    const ms = reduced ? duration.fast : duration.base;
    if (!reduced) {
      const target = exitTarget(decision, metrics.current.w, metrics.current.h);
      gx.value = withTiming(target.x, { duration: ms, easing: easings.out });
      gy.value = withTiming(target.y, { duration: ms, easing: easings.out });
    }
    fade.value = withTiming(0, { duration: ms, easing: reduced ? easings.linear : easings.out });
    timer.current = setTimeout(() => live.current.onExited(decision), ms);
  };

  const refuse = () => {
    if (leaving.current) return;
    springBack();
    live.current.onRefuse();
  };

  controlRef.current = { exit, refuse };

  // biome-ignore lint/correctness/useExhaustiveDependencies: les fonctions lisent `live` et des valeurs partagées stables
  const responder = useMemo(
    () =>
      PanResponder.create({
        // Un simple appui reste à la photo (moitiés gauche et droite) : on ne prend la main qu'au déplacement.
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) =>
          !live.current.disabled && !leaving.current && (Math.abs(g.dx) > 10 || Math.abs(g.dy) > 10),
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_, g) => {
          gx.value = g.dx;
          // Vers le bas, la carte résiste (rien à décider de ce côté).
          gy.value = g.dy < 0 ? g.dy : g.dy * 0.15;
        },
        onPanResponderRelease: (_, g) => {
          const s = swipeState(g.dx, g.dy, metrics.current.w);
          if (s.decision === "refuse") refuse();
          else if (s.decision) exit(s.decision);
          else springBack();
        },
        onPanResponderTerminate: () => springBack(),
      }),
    [],
  );

  const cardStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: reducedMotion
      ? []
      : [{ translateX: gx.value }, { translateY: gy.value }, { rotate: `${swipeRotation(gx.value, width.value)}deg` }],
  }));
  const acceptTag = useAnimatedStyle(() => ({
    opacity: swipeProgress(gx.value, gy.value, width.value * SWIPE_THRESHOLD_RATIO, DIR_ACCEPT),
  }));
  const waitTag = useAnimatedStyle(() => ({
    opacity: swipeProgress(gx.value, gy.value, width.value * SWIPE_THRESHOLD_RATIO, DIR_WAITLIST),
  }));
  const refuseTag = useAnimatedStyle(() => ({
    opacity: swipeProgress(gx.value, gy.value, width.value * SWIPE_THRESHOLD_RATIO, DIR_REFUSE),
  }));

  const c = t.color;
  return (
    <View
      style={styles.fill}
      onLayout={(e) => {
        metrics.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
        width.value = e.nativeEvent.layout.width;
      }}
    >
      <Animated.View style={[styles.fill, webGuard, cardStyle]} {...responder.panHandlers} testID={testID}>
        {children}
        <View pointerEvents="none" style={styles.tags}>
          <Animated.View
            style={[styles.tag, styles.tagLeft, { backgroundColor: c.statusRetained }, acceptTag]}
            testID="triage-tag-accept"
          >
            <Text variant="label" color={c.accentInk}>
              {triageAppLabels.tagAccepted}
            </Text>
          </Animated.View>
          <Animated.View
            style={[styles.tag, styles.tagCenter, { backgroundColor: c.statusWaitlistOnPlate }, waitTag]}
            testID="triage-tag-waitlist"
          >
            <Text variant="label" color={c.night}>
              {triageAppLabels.tagWaitlisted}
            </Text>
          </Animated.View>
          <Animated.View
            style={[
              styles.tag,
              styles.tagRight,
              { backgroundColor: c.statusRefused, borderColor: c.night, borderStyle: "dashed", borderWidth: 1.5 },
              refuseTag,
            ]}
            testID="triage-tag-refuse"
          >
            <Text variant="label" color={c.night} style={styles.strike}>
              {triageAppLabels.tagRefused}
            </Text>
          </Animated.View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  tags: { ...StyleSheet.absoluteFill },
  tag: {
    position: "absolute",
    top: space4,
    paddingVertical: space2,
    paddingHorizontal: space3,
    borderRadius: radiusPill,
  },
  tagLeft: { left: space4 },
  tagCenter: { alignSelf: "center", left: "30%" },
  tagRight: { right: space4 },
  strike: { textDecorationLine: "line-through" },
});
