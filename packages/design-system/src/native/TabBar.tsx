// TabBar : cinq onglets. Voir docs/design-system/components/TabBar.
// Lot C1 (D33) : reproduit la `.tabbar` de l'artefact DA v2 : barre flottante (10 px des bords et du bas, au-dessus de
// la zone de sécurité), 66 px, rayon 22, fond `--bar` uni, ombre portée et reflet intérieur ; onglets 115 % 800 9,5 px ;
// indicateur moutarde incliné 26 × 4 sous l'onglet actif ; le O central dans un rond de 68 px (`.obtn`) qui déborde de
// 22 px vers le haut, bordé de `--bar-line` (moutarde s'il est actif), son libellé dessous. Plus de métal brossé.

import { type ReactNode, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import type { IconName } from "../icons";
import { type TabSetName, tabSets } from "../labels";
import { Icon } from "./Icon";
import { useParkStyle } from "./motionHooks";
import { CenterTabO } from "./olive/CenterTabO";
import { LABEL_ROOM, tabLabelFit } from "./tabLabel";
import { Text } from "./text";
import { radius, useTheme } from "./theme";

export type TabItem = {
  id: string;
  label: string;
  icon: IconName;
  /** L'onglet du milieu (Accueil, ou Direct pour l'organisateur ; v1 : Accès, Tri). */
  center?: boolean;
  /** DA v2 : l'onglet du milieu porte le O (la voiture garée ; animé par le lot 39 via `centerSlot`). */
  o?: boolean;
  /** Pastille de notification moutarde de 8 px sur l'icône (la Boîte). */
  dot?: boolean;
};

export type TabBarProps = {
  /** Le profil : choisit les cinq onglets (DA v2). Ignoré si `tabs` est fourni. */
  set?: TabSetName;
  /** Contenu du O de l'onglet central ; par défaut le O vivant (CenterTabO, lot 39) : garé si actif, sorti sinon. */
  centerSlot?: ReactNode;
  tabs?: readonly TabItem[];
  /** Identifiant de l'onglet actif. */
  active: string;
  onSelect?: (id: string) => void;
  /** Hauteur de la zone de sécurité du bas (barre de gestes) : la barre flotte 10 px au-dessus. */
  safeBottom?: number;
  style?: ViewStyle;
};

/** Le rond du O déborde de 22 px au-dessus de la barre (`.obtn { top: -22px }`). */
export const TAB_OVERHANG = 22;
/** Hauteur de la barre (`.tabbar`). */
export const TAB_BAR_HEIGHT = 66;
/** Marge de la barre flottante (gauche, droite, bas). */
export const TAB_BAR_INSET = 10;
/** Place occupée sous le contenu par la barre flottante (hors zone de sécurité) : 66 + 10. */
export const TAB_BAR_SPACE = TAB_BAR_HEIGHT + TAB_BAR_INSET;
const O_SIZE = 68;
function TabIcon({ tab, active, moved, ink }: { tab: TabItem; active: boolean; moved: boolean; ink: string }) {
  const { t } = useTheme();
  // Le nouvel onglet se gare, mais seulement quand l'onglet change : pas au premier rendu.
  const park = useParkStyle({ enabled: moved && active && !tab.center, trigger: active });
  return (
    <Animated.View style={[park, active ? styles.iconOn : null]}>
      <Icon name={tab.icon} size={22} strokeWidth={2} filled={active ? "parts" : false} color={ink} />
      {tab.dot && <View style={[styles.dot, { backgroundColor: t.color.accent }]} />}
    </Animated.View>
  );
}

function TabEntry({
  tab,
  active,
  moved,
  onSelect,
  centerSlot,
}: {
  tab: TabItem;
  active: boolean;
  moved: boolean;
  onSelect?: (id: string) => void;
  centerSlot?: ReactNode;
}) {
  const { t } = useTheme();
  const c = t.color;
  const ink = active ? c.barInk : c.barMuted;
  if (tab.center) {
    // `.tab.center` : le rond `.obtn` au-dessus, le libellé en bas de la barre.
    return (
      <Pressable
        accessibilityRole="tab"
        accessibilityLabel={tab.label}
        accessibilityState={{ selected: active }}
        onPress={() => onSelect?.(tab.id)}
        style={[styles.tab, styles.centerTab]}
      >
        <View
          style={[
            styles.obtn,
            {
              backgroundColor: c.bar,
              borderColor: active ? c.accent : c.barEdge,
              boxShadow: t.shadow.shadowOButton,
            },
          ]}
        >
          {tab.o ? (
            (centerSlot ?? <CenterTabO active={active} size={58} />)
          ) : (
            <Icon name={tab.icon} size={30} color={active ? c.accent : c.barInk} />
          )}
        </View>
        <Text variant="tab" color={ink} style={[styles.label, tabLabelFit(tab.label)]}>
          {tab.label}
        </Text>
      </Pressable>
    );
  }
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={tab.label}
      accessibilityState={{ selected: active }}
      onPress={() => onSelect?.(tab.id)}
      style={[styles.tab, styles.sideTab]}
    >
      <TabIcon tab={tab} active={active} moved={moved} ink={ink} />
      <Text variant="tab" color={ink} style={[styles.label, tabLabelFit(tab.label)]}>
        {tab.label}
      </Text>
      {active ? (
        <View
          pointerEvents="none"
          style={[styles.indicator, { backgroundColor: c.accent }]}
          testID="tabbar-indicator"
        />
      ) : null}
    </Pressable>
  );
}

/**
 * Cinq onglets sur la barre flottante, avec le O au milieu (Accueil, ou Direct pour l'organisateur). Le mode staff, le
 * jour J et les écrans de flux n'ont pas de barre d'onglets : on en sort par le ✕.
 * Le composant se pose en bas de l'écran (le conteneur décide s'il flotte au-dessus du contenu) ; sa hauteur totale
 * est `TAB_OVERHANG + TAB_BAR_SPACE + safeBottom`.
 */
export function TabBar({ set = "exhibitor", tabs, active, onSelect, centerSlot, safeBottom = 0, style }: TabBarProps) {
  const { t } = useTheme();
  const c = t.color;
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
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: TAB_BAR_INSET + safeBottom }, style]}>
      {/* Lot C1, tour 2 : la rangée des onglets inclut le débord du O (22 px), pour que le haut du rond reçoive l'appui
          (Android ne livre pas un appui hors du cadre du parent) ; le fond de la barre est un calque dessous. */}
      <View
        pointerEvents="none"
        style={[
          styles.bar,
          styles.shell,
          { backgroundColor: c.bar, borderColor: c.barShellEdge, boxShadow: t.shadow.shadowTabbar },
        ]}
      />
      <View accessibilityRole="tablist" pointerEvents="box-none" style={styles.row}>
        {items.map((tab) => (
          <TabEntry
            key={tab.id}
            tab={tab}
            active={tab.id === active}
            moved={moved}
            onSelect={onSelect}
            centerSlot={centerSlot}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: TAB_BAR_INSET },
  row: { flexDirection: "row", height: TAB_BAR_HEIGHT + TAB_OVERHANG },
  shell: { position: "absolute", left: TAB_BAR_INSET, right: TAB_BAR_INSET, top: TAB_OVERHANG },
  sideTab: { marginTop: TAB_OVERHANG },
  bar: {
    flexDirection: "row",
    height: TAB_BAR_HEIGHT,
    borderRadius: 22,
    borderWidth: 1,
  },
  tab: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "center", gap: 4 },
  centerTab: { zIndex: 2, justifyContent: "flex-end", paddingBottom: 9 },
  iconOn: { transform: [{ translateY: -2 }] },
  obtn: {
    position: "absolute",
    top: 0,
    alignSelf: "center",
    width: O_SIZE,
    height: O_SIZE,
    borderRadius: O_SIZE / 2,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  // `.tab { white-space: nowrap }` : un libellé long (Événements, Structure) déborde un peu de sa colonne, sans
  // jamais être coupé ; la boîte du texte est plus large que l'onglet et centrée sur lui.
  label: { width: LABEL_ROOM, textAlign: "center" },
  indicator: {
    position: "absolute",
    bottom: 7,
    alignSelf: "center",
    width: 26,
    height: 4,
    borderRadius: 2,
    transform: [{ skewX: "-14deg" }],
  },
  dot: { position: "absolute", top: -2, right: -3, width: 8, height: 8, borderRadius: radius.radiusPill },
});
