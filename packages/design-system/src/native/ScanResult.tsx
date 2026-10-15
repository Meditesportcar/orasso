// ScanResult : OK (moutarde), déjà entré (crème), refusé (rouge). Voir docs/design-system/components/ScanResult.
// Deux présentations : la carte au bas de la caméra (jamais d'interruption de la caméra), et le plein écran coloré
// du scan staff (OK + zone / déjà entré / refusé) qui rend la main à la caméra au bout de `scan` (1 s).

import { useEffect } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { type ScanResultState, scanLabels } from "../labels";
import { shake } from "../motion";
import { Credit } from "./Brand";
import { withAlpha } from "./color";
import { Icon } from "./Icon";
import { duration, easings, useFadeStyle, useParkStyle } from "./motionHooks";
import { useNeonPulse } from "./neon";
import { playScanSound } from "./scanSounds";
import { Text } from "./text";
import { radius, useTheme } from "./theme";

export type ScanResultProps = {
  state: ScanResultState;
  /** Véhicule : jamais tronqué, passe sur deux lignes. */
  vehicle?: string;
  pseudo?: string;
  /** La zone attribuée, lue à distance (30 px) ; garde sa taille quel que soit le nom. */
  zone?: string;
  /** Texte de l'état : « il y a quatre secondes » (OK), « 19:12 » l'heure du premier scan (déjà entré). */
  time?: string;
  /** Raison du refus, en une ligne (« QR inconnu ou autre événement »). */
  reason?: string;
  /** Dernier scan : atténué à 88 % jusqu'au suivant. */
  settled?: boolean;
  /** Joue l'entrée : se gare du bas, néon en pic, refus secoué trois fois. Faux hors terrain. */
  animated?: boolean;
  /** Le son du résultat à l'affichage (un son bref, deux bips, un son grave). */
  sound?: boolean;
  /** Plein écran coloré : couvre son conteneur ; rend la main (`onReturn`) au bout de `scan`. */
  fullscreen?: boolean;
  /** Plein écran : appelé après 1 s, pour revenir à la caméra. */
  onReturn?: () => void;
  style?: ViewStyle;
};

/** La secousse du refus : trois allers-retours de ±7 px (jeton `shake`), fractions du cycle de 320 ms. */
const SHAKE_STEPS = [
  [17, -1],
  [33, 1],
  [50, -1],
  [67, 1],
  [83, -1],
  [100, 0],
] as const;

function useShake(active: boolean) {
  const { reducedMotion } = useTheme();
  const x = useSharedValue(0);
  useEffect(() => {
    if (!active || reducedMotion) return;
    let previous = 0;
    const steps = SHAKE_STEPS.map(([at, direction]) => {
      const step = withTiming(direction * shake.amplitude, {
        duration: ((at - previous) / 100) * shake.duration,
        easing: easings.inout,
      });
      previous = at;
      return step;
    });
    // Le refus se gare d'abord (`base`), puis il est secoué.
    x.value = withDelay(duration.base, withSequence(...steps));
  }, [active, reducedMotion, x]);
  return useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
}

/**
 * Le résultat d'un scan à l'entrée : une couleur, une forme, un son, un chiffre lisible à trois mètres.
 * OK = moutarde (ta place, tu passes), déjà entré = crème (une information, pas une faute), refusé = rouge.
 * Sans vert. S'affiche en bas de la caméra sans l'interrompre.
 */
export function ScanResult({
  state,
  vehicle,
  pseudo,
  zone,
  time,
  reason,
  settled = false,
  animated = true,
  sound = true,
  fullscreen = false,
  onReturn,
  style,
}: ScanResultProps) {
  const { t, theme } = useTheme();
  const c = t.color;
  const big = fullscreen;

  const park = useParkStyle({ enabled: animated && !fullscreen });
  const flash = useFadeStyle(fullscreen ? state : undefined);
  const shaking = useShake(animated && state === "refused");
  const neon = useNeonPulse();

  // À la détection : le son, puis le pic de néon (OK seulement : un seul néon pulse, et seulement pour un événement).
  // biome-ignore lint/correctness/useExhaustiveDependencies: un nouveau résultat (state) rejoue le son et le pic
  useEffect(() => {
    if (!animated) return;
    if (sound) playScanSound(state);
    if (state === "ok") neon.fire();
  }, [state, animated, sound]);

  // Plein écran : retour automatique à la caméra en 1 s.
  useEffect(() => {
    if (!fullscreen || !onReturn) return;
    const timer = setTimeout(onReturn, duration.scan);
    return () => clearTimeout(timer);
  }, [fullscreen, onReturn]);

  const kicker = state === "refused" ? scanLabels.refused : [scanLabels[state], time].filter(Boolean).join(" · ");
  const name = state === "refused" ? reason : [vehicle, pseudo].filter(Boolean).join(" · ");

  let background = c.accent;
  let ink = c.accentInk;
  let shadow: string = t.shadow.neonScan;
  let peak = `0 0 60px ${withAlpha(c.accent, 0.95)}`;
  if (state === "duplicate") {
    background = c.poster;
    ink = c.posterInk;
    shadow = t.shadow.shadowCard;
  } else if (state === "refused") {
    background = c.win;
    ink = c.winInk;
    shadow = t.shadow.neonWin;
  }
  // En Sable le soleil éteint les lampadaires : le pic de néon devient une ombre portée.
  if (theme === "sable") peak = t.shadow.neonScan;

  const iconSize = big ? 72 : 32;
  const body = (
    <>
      <View style={[styles.icon, big ? styles.iconBig : null, { borderColor: ink }]}>
        {state === "ok" && <Icon name="check" size={iconSize} strokeWidth={3} color={ink} />}
        {state === "duplicate" && (
          <Text variant="title" color={ink} style={big ? styles.digitBig : styles.digit}>
            2
          </Text>
        )}
        {state === "refused" && <Icon name="close" size={iconSize} strokeWidth={3} color={ink} />}
      </View>
      <View style={[styles.text, big ? styles.textBig : null]}>
        <Text variant="label" color={ink} style={[styles.kicker, big ? styles.centered : null]}>
          {kicker}
        </Text>
        {/* Le nom en style title (droit, 15–16 px) : à l'entrée on lit, on ne crie pas. Jamais tronqué. */}
        <Text
          variant="title"
          color={ink}
          style={[styles.name, big ? styles.nameBig : null, big ? styles.centered : null]}
        >
          {name}
        </Text>
      </View>
      {zone && state !== "refused" ? (
        <View style={[styles.zone, big ? styles.zoneBig : null]}>
          <Text variant="label" color={ink} style={styles.kicker}>
            Zone
          </Text>
          <Text variant="zone" color={ink} style={big ? styles.zoneTextBig : null}>
            {zone}
          </Text>
        </View>
      ) : null}
      {state !== "refused" && (
        <Credit surface={theme === "sable" && state === "duplicate" ? "dark-surface" : "light-surface"} />
      )}
    </>
  );

  const surface = [
    styles.card,
    big ? styles.cardBig : null,
    { backgroundColor: background, boxShadow: shadow },
    settled && styles.settled,
  ];

  return (
    <Animated.View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[fullscreen ? StyleSheet.absoluteFill : null, fullscreen ? flash : animated ? park : null, style]}
    >
      <Animated.View
        style={[surface, fullscreen ? styles.fill : null, state === "refused" && animated ? shaking : null]}
      >
        {body}
        {/* Le pic de néon : une couche qui retombe en `poster`. */}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.peak, { boxShadow: peak }, neon.style]}
        />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 22,
    borderRadius: radius.radiusLg,
  },
  cardBig: { flexDirection: "column", justifyContent: "center", gap: 24, borderRadius: 0 },
  fill: { flex: 1 },
  settled: { opacity: 0.88 },
  peak: { borderRadius: radius.radiusLg },
  icon: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderRadius: radius.radiusPill,
  },
  iconBig: { width: 128, height: 128, borderWidth: 6 },
  digit: { fontSize: 28, lineHeight: 28, letterSpacing: 0 },
  digitBig: { fontSize: 72, lineHeight: 72, letterSpacing: 0 },
  text: { flex: 1, minWidth: 0 },
  // Pas `flex: 0` : react-native-web le traduit en base nulle (texte écrasé sous la zone) ; même rendu en natif.
  textBig: { flexGrow: 0, flexShrink: 0, flexBasis: "auto", alignSelf: "stretch" },
  kicker: { opacity: 0.75 },
  name: { fontSize: 16, lineHeight: 18, letterSpacing: 0.32 },
  nameBig: { fontSize: 26, lineHeight: 30, letterSpacing: 0.52 },
  centered: { textAlign: "center" },
  zone: { alignItems: "flex-end" },
  zoneBig: { alignItems: "center" },
  zoneTextBig: { fontSize: 72, lineHeight: 72, letterSpacing: 2.9 },
});
