// Button : droit, capitales larges, une icône à gauche (toujours). Voir docs/design-system/components/Button.

import { type ReactNode, useState } from "react";
import { Pressable, type PressableProps, StyleSheet, type TextStyle, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import type { IconName } from "../icons";
import { withAlpha } from "./color";
import { Icon } from "./Icon";
import { Loader } from "./Loader";
import { usePressScale } from "./motionHooks";
import { Text } from "./text";
import { radius, spacing, useTheme } from "./theme";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Common = Omit<PressableProps, "children" | "style"> & {
  children?: ReactNode;
  style?: ViewStyle;
  /** Travail en cours : l'indicateur du kit (24 px) remplace l'icône et le néon s'éteint. */
  loading?: boolean;
  /** La flèche « suivant » à droite : libellé qui ouvre un mode plein écran. */
  next?: boolean;
  /** `column` : icône au-dessus du libellé (rangée de trois du tri et du staff). */
  layout?: "row" | "column";
  fullWidth?: boolean;
};

/** Tout bouton porte une icône à gauche de son libellé : `icon` est obligatoire (sauf la pastille ✕, qui est une icône). */
export type ButtonProps =
  | (Common & { variant?: "primary" | "secondary" | "poster" | "alert"; icon: IconName })
  /** Fond graphite (plaque), contour poster à 50 % ; `tone` : pointillé pour Refuser, bleu pour Attente. */
  | (Common & { variant: "plate"; icon: IconName; tone?: "default" | "dashed" | "wait" })
  /** Secours du staff : 72 px (Plaque, Express, Sans scan) ou 56 px (Liste, Incident, Discussion). */
  | (Common & { variant: "rescue"; icon: IconName; height?: 56 | 72; dashed?: boolean })
  /** La pastille ✕ de 34 px, seule façon de quitter un écran de flux. `label` : nom accessible obligatoire. */
  | (Common & {
      variant: "close";
      label: string;
      onPhoto?: boolean;
      /** Posée sur une barre (en-tête) : encre de barre, contour `line` (la barre est nuit dans les deux thèmes, DA v2). */
      onBar?: boolean;
      icon?: IconName;
    });

type Loose = Common & {
  variant?: string;
  icon?: IconName;
  tone?: string;
  height?: number;
  dashed?: boolean;
  onPhoto?: boolean;
  onBar?: boolean;
  label?: string;
};

// Icône : 20 px sur le principal, 18 px ailleurs, 22 px au-dessus du libellé et sur les gros boutons du staff.
function iconSize(variant: string, layout: string): number {
  if (variant === "close") return 16;
  if (layout === "column" || variant === "rescue") return 22;
  return variant === "primary" ? 20 : 18;
}

/**
 * Le bouton Orasso : droit, en capitales larges, une icône à gauche (toujours). Un seul bouton principal par écran.
 */
export function Button(props: ButtonProps) {
  const {
    variant = "primary",
    icon,
    tone,
    height,
    dashed,
    onPhoto,
    onBar,
    label,
    children,
    style,
    loading,
    next,
    layout = "row",
    fullWidth,
    disabled,
    ...rest
  } = props as Loose;
  const { t, theme } = useTheme();
  const c = t.color;
  const press = usePressScale();
  const [pressed, setPressed] = useState(false);

  let box: ViewStyle = {};
  let ink = c.ink;
  let fontSize: number | undefined;
  let lineHeight: number | undefined;
  switch (variant) {
    case "primary":
      box = { backgroundColor: c.accent, boxShadow: pressed ? t.shadow.neonAccentSoft : t.shadow.neonAccent };
      ink = c.accentInk;
      break;
    case "secondary":
      box = { borderWidth: 1.5, borderColor: c.ink };
      break;
    case "poster":
      box = { backgroundColor: c.night, boxShadow: t.shadow.shadowCard };
      ink = c.accent;
      break;
    case "alert":
      box = { minHeight: 56, paddingHorizontal: 28, backgroundColor: c.win, boxShadow: t.shadow.neonWin };
      ink = c.winInk;
      break;
    case "plate": {
      const wait = tone === "wait";
      ink = wait ? c.statusWaitlistOnPlate : c.plateInk;
      box = {
        backgroundColor: c.plate,
        borderWidth: 1.5,
        borderColor: wait ? c.statusWaitlistOnPlate : withAlpha(c.plateInk, 0.5),
        borderStyle: tone === "dashed" ? "dashed" : "solid",
      };
      break;
    }
    case "rescue":
      box = {
        minHeight: height === 72 ? 72 : 56,
        flexDirection: "column",
        gap: 4,
        paddingHorizontal: 12,
        backgroundColor: c.surface,
        borderWidth: theme === "sable" ? 2 : 1.5,
        borderColor: c.ink,
        borderStyle: dashed ? "dashed" : "solid",
      };
      fontSize = 11;
      break;
    case "close":
      box = onPhoto
        ? {
            width: 36,
            height: 36,
            minHeight: 36,
            padding: 0,
            backgroundColor: withAlpha(c.night, 0.55),
            borderRadius: radius.radiusChip,
          }
        : {
            width: 34,
            height: 34,
            minHeight: 34,
            padding: 0,
            borderRadius: radius.radiusChip,
            borderWidth: theme === "sable" && !onBar ? 2 : 1.5,
            borderColor: theme === "sable" && !onBar ? c.ink : c.line,
            backgroundColor: theme === "sable" && !onBar ? withAlpha(c.nightInk, 0.22) : "transparent",
          };
      ink = onPhoto ? c.nightInk : onBar ? c.barInk : c.ink;
      break;
  }
  if (layout === "column") {
    box = { ...box, flex: 1, minWidth: 0, flexDirection: "column", gap: 4, paddingVertical: 12, paddingHorizontal: 6 };
    fontSize = 11;
    lineHeight = 13;
  }
  const inactive = disabled || loading;
  const labelStyle: TextStyle = {
    color: ink,
    ...(fontSize ? { fontSize, lineHeight: lineHeight ?? fontSize + 2 } : null),
  };

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={variant === "close" ? label : undefined}
      accessibilityState={{ disabled: Boolean(disabled), busy: Boolean(loading) }}
      disabled={inactive}
      onPressIn={(e) => {
        setPressed(true);
        press.onPressIn();
        rest.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setPressed(false);
        press.onPressOut();
        rest.onPressOut?.(e);
      }}
      {...rest}
      style={[
        styles.base,
        box,
        fullWidth && styles.full,
        disabled && styles.disabled,
        loading && { boxShadow: "none" },
        press.style,
        style,
      ]}
    >
      {variant === "close" ? (
        <Icon name={icon ?? "close"} size={iconSize(variant, layout)} strokeWidth={2.2} color={ink} />
      ) : (
        <>
          {loading ? (
            <Loader size={24} tone={variant === "primary" ? "light" : "dark"} />
          ) : (
            icon && <Icon name={icon} size={iconSize(variant, layout)} color={ink} />
          )}
          <Text variant="button" style={[styles.label, layout === "column" && styles.columnLabel, labelStyle]}>
            {children}
          </Text>
          {next && <Icon name="next" size={18} color={ink} />}
        </>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    minHeight: spacing.touch,
    paddingHorizontal: 20,
    borderRadius: radius.radiusMd,
    alignSelf: "flex-start",
  },
  full: { alignSelf: "stretch" },
  disabled: { opacity: 0.4, boxShadow: "none" },
  label: { flexShrink: 1 },
  columnLabel: { textAlign: "center" },
});
