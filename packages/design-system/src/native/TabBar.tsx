// TabBar : cinq onglets sur métal brossé. Voir docs/design-system/components/TabBar.

import { type ReactNode, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import type { IconName } from "../icons";
import { type TabSetName, tabSets } from "../labels";
import { Monogram } from "./Brand";
import { textShadowOf } from "./color";
import { archivoFamily } from "./fontFamily";
import { Icon } from "./Icon";
import { Metal } from "./Metal";
import { useParkStyle } from "./motionHooks";
import { Text } from "./text";
import { angle, radius, spacing, useTheme } from "./theme";

export type TabItem = {
  id: string;
  label: string;
  icon: IconName;
  /** L'onglet du milieu : pastille inclinée en néon (Accueil, ou Direct pour l'organisateur ; v1 : Accès, Tri). */
  center?: boolean;
  /** DA v2 : l'onglet du milieu porte le O (la voiture garée ; animé par le lot 39 via `centerSlot`). */
  o?: boolean;
  /** Pastille de notification moutarde de 8 px sur l'icône (la Boîte). */
  dot?: boolean;
};

export type TabBarProps = {
  /** Le profil : choisit les cinq onglets (DA v2). Ignoré si `tabs` est fourni. */
  set?: TabSetName;
  /** Contenu du O de l'onglet central (lot 39 : le O vivant) ; par défaut le monogramme, voiture garée. */
  centerSlot?: ReactNode;
  tabs?: readonly TabItem[];
  /** Identifiant de l'onglet actif. */
  active: string;
  onSelect?: (id: string) => void;
  /** Hauteur de la zone de sécurité du bas (barre de gestes), ajoutée sous les 80 px. */
  safeBottom?: number;
  style?: ViewStyle;
};

/** L'onglet du milieu déborde de 16 px vers le haut : la barre réserve cette hauteur pour qu'il reste cliquable. */
export const TAB_OVERHANG = 16;

function TabIcon({
  tab,
  active,
  moved,
  ink,
  centerSlot,
}: {
  tab: TabItem;
  active: boolean;
  moved: boolean;
  ink: string;
  centerSlot?: ReactNode;
}) {
  const { t } = useTheme();
  // Le nouvel onglet se gare, mais seulement quand l'onglet change : pas au premier rendu.
  const park = useParkStyle({ enabled: moved && active && !tab.center, trigger: active });
  if (tab.center && tab.o) return <>{centerSlot ?? <Monogram size={30} tone="dark" alt="" />}</>;
  return (
    <Animated.View style={park}>
      <Icon name={tab.icon} size={22} strokeWidth={1.8} filled={active && !tab.center} color={ink} />
      {tab.dot && (
        <View style={[styles.dot, { backgroundColor: t.color.accent, boxShadow: t.shadow.neonAccentSoft }]} />
      )}
    </Animated.View>
  );
}

function TabEntry({
  tab,
  active,
  moved,
  onSelect,
  centerSlot,
  compact,
}: {
  tab: TabItem;
  active: boolean;
  moved: boolean;
  onSelect?: (id: string) => void;
  centerSlot?: ReactNode;
  /** Barre v2 : libellés à la largeur normale d'Archivo pour que les plus longs tiennent (journal, lot 38). */
  compact?: boolean;
}) {
  const { t, theme } = useTheme();
  const c = t.color;
  const emboss = textShadowOf(t.shadow.embossBar);
  let ink = active ? c.barInk : c.barMuted;
  let center: ViewStyle | null = null;
  if (tab.center) {
    // DA v2 : le O sur une pastille nuit bordée de moutarde, dans les deux thèmes ; v1 : moutarde (Béton), nuit (Sable).
    const night = tab.o || theme === "sable";
    ink = night ? c.accent : c.accentInk;
    center = {
      marginTop: -TAB_OVERHANG,
      marginHorizontal: 6,
      marginBottom: 12,
      borderRadius: 18,
      backgroundColor: night ? c.night : c.accent,
      // DA v2 : pastille du O de 68 px (prototype), le reste de la largeur aux quatre autres onglets.
      ...(tab.o ? { borderWidth: 2, borderColor: c.accent, flexGrow: 0, flexBasis: 68 } : null),
      boxShadow: t.shadow.neonAccent,
      transform: [{ skewX: `${angle.skewTab}deg` }],
    };
  }
  const counter = tab.center ? { transform: [{ skewX: `${-angle.skewTab}deg` }], alignItems: "center" as const } : null;
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={tab.label}
      accessibilityState={{ selected: active }}
      onPress={() => onSelect?.(tab.id)}
      style={[styles.tab, center]}
    >
      <View style={counter}>
        <TabIcon tab={tab} active={active} moved={moved} ink={ink} centerSlot={centerSlot} />
      </View>
      <View style={counter}>
        <Text variant="tab" color={ink} style={[tab.center ? null : emboss, compact ? styles.compact : null]}>
          {tab.label}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * Cinq onglets sur la barre nuit, avec le O au milieu (Accueil, ou Direct pour l'organisateur) comme une pastille
 * d'affiche inclinée : le seul néon de la barre. Le mode staff et le mode jour J n'ont pas de barre d'onglets : on en
 * sort par la pastille ✕ de l'en-tête.
 */
export function TabBar({ set = "exhibitor", tabs, active, onSelect, centerSlot, safeBottom = 0, style }: TabBarProps) {
  const { t } = useTheme();
  const items: readonly TabItem[] = tabs ?? tabSets[set];
  const compactLabels = items.some((tab) => tab.o);
  const previous = useRef(active);
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    if (previous.current !== active) {
      previous.current = active;
      setMoved(true);
    }
  }, [active]);
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        { height: spacing.barTabs + TAB_OVERHANG + safeBottom, paddingTop: TAB_OVERHANG, paddingBottom: safeBottom },
        style,
      ]}
    >
      <View
        pointerEvents="none"
        style={[
          styles.metal,
          {
            top: TAB_OVERHANG,
            borderTopWidth: 2,
            borderTopColor: t.color.accent,
            boxShadow: t.shadow.shadowBarBottom,
          },
        ]}
      >
        <Metal />
      </View>
      {items.map((tab) => (
        <TabEntry
          key={tab.id}
          tab={tab}
          active={tab.id === active}
          moved={moved}
          onSelect={onSelect}
          centerSlot={centerSlot}
          compact={compactLabels}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row" },
  metal: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderBottomLeftRadius: radius.radiusXl,
    borderBottomRightRadius: radius.radiusXl,
  },
  tab: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center", gap: 5 },
  compact: { fontFamily: archivoFamily("normal", 800, false), letterSpacing: 0.2 },
  dot: { position: "absolute", top: -2, right: -3, width: 8, height: 8, borderRadius: radius.radiusPill },
});
