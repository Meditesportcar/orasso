// PosterCard : la carte affiche, seule carte claire de l'écran. Voir docs/design-system/components/PosterCard.

import { type ReactNode, useEffect } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import type { IconName } from "../icons";
import { Credit } from "./Brand";
import { Button } from "./Button";
import { withAlpha } from "./color";
import { GradientFill } from "./Gradient";
import { Reveal } from "./Motion";
import { duration, easings } from "./motionHooks";
import { useNeonPulse } from "./neon";
import { Photo, type PhotoProps } from "./Photo";
import { Text } from "./text";
import { angle, radius, useTheme } from "./theme";

/** Bandeau en coin : Retenue et Sur place (moutarde), Annulé (rouge), Incertain (hachuré) ; En attente : aucun. */
export type PosterStatus = "pending" | "retained" | "onsite" | "cancelled" | "uncertain";

const bandLabels: Record<Exclude<PosterStatus, "pending">, string> = {
  retained: "Retenue",
  onsite: "Sur place",
  cancelled: "Annulé",
  uncertain: "Incertain",
};

export type PosterCardProps = {
  /** Étiquette au-dessus du titre (« Prochain accès · J-2 »). */
  label: ReactNode;
  /** Titre en italique large, deux lignes au plus (saut de ligne avec \n). */
  title: string;
  /** Ligne de faits sous le titre (« Sam 17 oct · 19 h · Zone JDM · 21° »). */
  facts?: ReactNode;
  /** La photo, coupée à 10° : une image, ou un dégradé de maquette. */
  photo?: Pick<PhotoProps, "source" | "placeholder">;
  /** Le bouton « sur affiche » qui chevauche la photo de 14 px. */
  action?: { label: string; icon: IconName; next?: boolean; onPress?: () => void };
  status?: PosterStatus;
  /** Se dévoile par la coupe à 10° (`poster`). Faux pour le mode staff et le mode jour J (terrain). */
  reveal?: boolean;
  /** Affiche la signature « ORASSO » : celle de l'écran, donc jamais sur une autre carte du même écran. */
  credit?: boolean;
  style?: ViewStyle;
};

function Band({ status, reveal }: { status: Exclude<PosterStatus, "pending">; reveal: boolean }) {
  const { t, reducedMotion } = useTheme();
  const c = t.color;
  const stamp = useSharedValue(reveal ? 0 : 1);
  const neon = useNeonPulse();
  useEffect(() => {
    if (!reveal) return;
    stamp.value = withTiming(1, {
      duration: reducedMotion ? duration.fast : duration.poster,
      easing: reducedMotion ? easings.linear : easings.out,
    });
    neon.fire();
  }, [reveal, reducedMotion, stamp, neon.fire]);
  // Le bandeau se tamponne : échelle 1,9 → 1 (`poster`).
  const style = useAnimatedStyle(() => ({
    opacity: stamp.value,
    transform: [
      { rotate: `${angle.band}deg` },
      { scale: reducedMotion ? 1 : interpolate(stamp.value, [0, 1], [1.9, 1]) },
    ],
  }));

  let background = c.accent;
  let ink = c.accentInk;
  let shadow: string = t.shadow.neonAccentSoft;
  if (status === "cancelled") {
    background = c.statusCancelled;
    ink = c.winInk;
    shadow = t.shadow.neonWin;
  }
  return (
    <Animated.View style={[styles.band, { backgroundColor: background, boxShadow: shadow }, style]}>
      {status === "uncertain" && (
        <GradientFill
          css={`repeating-linear-gradient(45deg, ${c.statusUncertain} 0 6px, ${withAlpha(c.statusUncertain, 0.45)} 6px 10px)`}
        />
      )}
      <Text variant="label" color={ink}>
        {bandLabels[status]}
      </Text>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { boxShadow: `0 0 18px ${c.accent}` }, neon.style]}
      />
    </Animated.View>
  );
}

/**
 * La carte affiche : la seule carte claire de l'écran, celle qui porte ce qui est à toi. Une seule par écran,
 * jamais deux empilées, jamais dans une liste qui défile à l'horizontale. En Sable elle s'inverse par les jetons.
 */
export function PosterCard({
  label,
  title,
  facts,
  photo,
  action,
  status = "pending",
  reveal = true,
  credit = true,
  style,
}: PosterCardProps) {
  const { t, theme } = useTheme();
  const c = t.color;
  const card = (
    <View
      style={[
        styles.card,
        { backgroundColor: c.poster, boxShadow: t.shadow.shadowPoster, paddingBottom: action ? 12 : 28 },
        style,
      ]}
    >
      {status !== "pending" && <Band status={status} reveal={reveal} />}
      <Text variant="label" color={c.posterMuted} style={styles.label}>
        {label}
      </Text>
      <Text variant="posterXl" color={theme === "sable" ? c.accent : c.posterInk} style={styles.title}>
        {title}
      </Text>
      {facts ? (
        <Text variant="meta" color={c.posterMuted} style={styles.facts}>
          {facts}
        </Text>
      ) : null}
      {photo ? <Photo {...photo} cut="poster" style={styles.photo} /> : null}
      {action ? (
        <View style={styles.action}>
          <Button variant="poster" icon={action.icon} next={action.next} onPress={action.onPress} fullWidth>
            {action.label}
          </Button>
        </View>
      ) : null}
      {credit && (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Credit surface={theme === "sable" ? "dark-surface" : "light-surface"} />
        </View>
      )}
    </View>
  );
  return reveal ? <Reveal>{card}</Reveal> : card;
}

const styles = StyleSheet.create({
  card: { position: "relative", overflow: "hidden", borderRadius: radius.radiusLg },
  label: { paddingTop: 16, paddingHorizontal: 16 },
  title: { paddingTop: 6, paddingHorizontal: 16 },
  facts: { paddingTop: 8, paddingHorizontal: 16 },
  photo: { height: 110, marginTop: 12 },
  action: { marginTop: -14, marginHorizontal: 12 },
  band: {
    position: "absolute",
    top: 18,
    right: -44,
    zIndex: 1,
    paddingVertical: 4,
    paddingHorizontal: 52,
    overflow: "hidden",
  },
});
