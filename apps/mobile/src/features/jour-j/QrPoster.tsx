// La carte du QR du jour J (lot 48, prototype `s-qr`) : en-tête selon le profil (zone et véhicule, emplacement et
// prestataire, entrée et billet, accès presse et badge), le QR, l'anneau qui se vide en 20 s, « Nouveau code dans N s ·
// n° 4 821 », « Orasso » signé en bas comme les affiches. Sans `rotating`, le QR est statique (billet du public).
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Rect } from "react-native-svg";

import { QrCode } from "@/ui/QrCode";

import { formatCodeNumber, STEP_SECONDS } from "./useRotatingCode";

const { space1, space2, space3, space4 } = tokens.spacing;
const AnimatedRect = Animated.createAnimatedComponent(Rect);

/** En-tête : à gauche le grand repère (zone, emplacement…), à droite qui et quoi (jamais tronqué). */
export type QrHolder = { label: string; value: string; rightLabel: string; lines: string[] };

export type QrPosterProps = {
  holder: QrHolder;
  value: string;
  /** Code tournant : secondes restantes et numéro du code. Absent : QR statique. */
  rotating?: { secondsLeft: number; number: number };
  size: number;
  label: string;
};

const RING = 6;
const RADIUS = 14;

/** Anneau sur le pourtour du QR : plein au nouveau code, vide quand le suivant arrive. */
function Ring({ box, secondsLeft }: { box: number; secondsLeft: number }) {
  const { t, reducedMotion } = useTheme();
  const side = box - RING;
  const perimeter = 4 * (side - 2 * RADIUS) + 2 * Math.PI * RADIUS;
  // Fraction restante à la fin de la seconde en cours (l'anneau glisse pendant la seconde, sans à-coup).
  const left = useSharedValue(secondsLeft / STEP_SECONDS);
  useEffect(() => {
    const target = (secondsLeft - 1) / STEP_SECONDS;
    if (reducedMotion || secondsLeft === STEP_SECONDS) left.value = secondsLeft / STEP_SECONDS;
    if (!reducedMotion) left.value = withTiming(target, { duration: 1000, easing: Easing.linear });
  }, [secondsLeft, reducedMotion, left]);
  const props = useAnimatedProps(() => {
    "worklet";
    return { strokeDashoffset: perimeter * (1 - left.value) };
  });
  return (
    <Svg width={box} height={box} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Rect
        x={RING / 2}
        y={RING / 2}
        width={side}
        height={side}
        rx={RADIUS}
        fill="none"
        stroke={t.color.posterMuted}
        strokeOpacity={0.25}
        strokeWidth={RING}
      />
      <AnimatedRect
        x={RING / 2}
        y={RING / 2}
        width={side}
        height={side}
        rx={RADIUS}
        fill="none"
        stroke={t.color.accent}
        strokeWidth={RING}
        strokeDasharray={`${perimeter} ${perimeter}`}
        animatedProps={props}
      />
    </Svg>
  );
}

export function QrPoster({ holder, value, rotating, size, label }: QrPosterProps) {
  const { t } = useTheme();
  const c = t.color;
  const box = size + 2 * space3;
  return (
    <View style={[styles.card, { backgroundColor: c.poster, boxShadow: t.shadow.shadowPoster }]} testID="qr-poster">
      <View style={styles.head}>
        <View style={styles.headLeft}>
          <Text variant="label" color={c.posterMuted}>
            {holder.label}
          </Text>
          <Text variant="zone" color={c.posterInk} testID="qr-holder-value">
            {holder.value}
          </Text>
        </View>
        <View style={styles.headRight}>
          <Text variant="label" color={c.posterMuted} style={styles.right}>
            {holder.rightLabel}
          </Text>
          {holder.lines.map((line) => (
            <Text key={line} variant="bodyStrong" color={c.posterInk} style={styles.right}>
              {line}
            </Text>
          ))}
        </View>
      </View>
      <View style={[styles.qrBox, { width: box, height: box }]}>
        {rotating ? <Ring box={box} secondsLeft={rotating.secondsLeft} /> : null}
        <QrCode value={value} size={size} label={label} />
      </View>
      {rotating ? (
        <View style={styles.foot} testID="qr-countdown">
          <Text variant="meta" color={c.posterMuted}>
            Nouveau code dans
          </Text>
          <Text variant="bodyStrong" color={c.posterInk} testID="qr-seconds">
            {rotating.secondsLeft} s
          </Text>
          <Text variant="meta" color={c.posterMuted} testID="qr-number">
            n° {formatCodeNumber(rotating.number)}
          </Text>
        </View>
      ) : null}
      <Text variant="credit" color={c.posterMuted} style={styles.credit}>
        Orasso
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: tokens.radius.radiusLg, padding: space4, gap: space3, alignItems: "stretch" },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", gap: space3 },
  headLeft: { gap: space1 },
  headRight: { flex: 1, gap: 0, alignItems: "flex-end" },
  right: { textAlign: "right" },
  qrBox: { alignSelf: "center", alignItems: "center", justifyContent: "center" },
  foot: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: space2 },
  credit: { alignSelf: "flex-end" },
});
