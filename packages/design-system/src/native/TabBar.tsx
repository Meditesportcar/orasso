// TabBar : cinq onglets sur métal brossé. Voir docs/design-system/components/TabBar.

import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import type { IconName } from "../icons";
import { type TabSetName, tabSets } from "../labels";
import { textShadowOf } from "./color";
import { Icon } from "./Icon";
import { Metal } from "./Metal";
import { useParkStyle } from "./motionHooks";
import { Text } from "./text";
import { angle, radius, spacing, useTheme } from "./theme";

export type TabItem = {
  id: string;
  label: string;
  icon: IconName;
  /** L'onglet du milieu : pastille inclinée en néon (Accès pour le passionné et le pro, Tri pour l'organisateur). */
  center?: boolean;
  /** Pastille de notification moutarde de 8 px sur l'icône (la Boîte). */
  dot?: boolean;
};

export type TabBarProps = {
  /** La casquette : choisit les cinq onglets du README. Ignoré si `tabs` est fourni. */
  set?: TabSetName;
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

function TabIcon({ tab, active, moved, ink }: { tab: TabItem; active: boolean; moved: boolean; ink: string }) {
  const { t } = useTheme();
  // Le nouvel onglet se gare, mais seulement quand l'onglet change : pas au premier rendu.
  const park = useParkStyle({ enabled: moved && active && !tab.center, trigger: active });
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
}: {
  tab: TabItem;
  active: boolean;
  moved: boolean;
  onSelect?: (id: string) => void;
}) {
  const { t, theme } = useTheme();
  const c = t.color;
  const emboss = textShadowOf(t.shadow.embossBar);
  let ink = active ? c.barInk : c.barMuted;
  let center: ViewStyle | null = null;
  if (tab.center) {
    ink = theme === "sable" ? c.accent : c.accentInk;
    center = {
      marginTop: -TAB_OVERHANG,
      marginHorizontal: 6,
      marginBottom: 12,
      borderRadius: 18,
      backgroundColor: theme === "sable" ? c.night : c.accent,
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
        <TabIcon tab={tab} active={active} moved={moved} ink={ink} />
      </View>
      <View style={counter}>
        <Text variant="tab" color={ink} style={tab.center ? null : emboss}>
          {tab.label}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * Cinq onglets sur du métal brossé, avec l'Accès (ou le Tri) au milieu comme une pastille d'affiche. Le mode
 * staff et le mode jour J n'ont pas de barre d'onglets : on en sort par la pastille ✕ de l'en-tête.
 */
export function TabBar({ set = "fan", tabs, active, onSelect, safeBottom = 0, style }: TabBarProps) {
  const { t } = useTheme();
  const items: readonly TabItem[] = tabs ?? tabSets[set];
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
        <TabEntry key={tab.id} tab={tab} active={tab.id === active} moved={moved} onSelect={onSelect} />
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
  dot: { position: "absolute", top: -2, right: -3, width: 8, height: 8, borderRadius: radius.radiusPill },
});
