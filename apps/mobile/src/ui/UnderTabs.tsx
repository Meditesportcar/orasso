// Onglets soulignés du kit (lot R8x, maquette R8 `.r8tabs`) : une rangée sur le fond de l'écran, un trait bas de 1,5 px,
// des onglets de 40 px (zone tactile portée au jeton `touch`), le libellé en gras atténué, l'onglet actif en encre avec
// un soulignement moutarde de 3 px à coins hauts arrondis. Icône facultative à gauche ; nombre facultatif collé au
// libellé (« Événements · 7 ») ; défilement horizontal si la rangée déborde ; `spread` répartit les onglets sur la
// largeur (Explorer). Le libellé est plafonné à ×1,12 de police et ne se coupe jamais au milieu d'un mot.
// Le collant (rangée qui reste en haut au défilement) n'est pas ici : c'est l'écran hôte qui colle la rangée.
import { archivoAt, Icon, type IconName, Text, tokens, useTheme } from "@orasso/design-system/native";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

const { space1, space2 } = tokens.spacing;
const TAB_HEIGHT = 40;
/** Le plafond de police des libellés (`data-fsmax="1.12"` de la maquette). */
const MAX_FONT_SCALE = 1.12;
const LINE = 1.5;
const BAR = 3;
const HIT = Math.max(0, (tokens.spacing.touch - TAB_HEIGHT) / 2);

export type UnderTab<T extends string> = { id: T; label: string; icon?: IconName; count?: number | null };

/** Le libellé affiché : « Événements · 7 » quand le nombre est connu (jamais « · 0 » pour un nombre inconnu). */
export function underTabLabel(label: string, count?: number | null): string {
  return typeof count === "number" && Number.isFinite(count) ? `${label} · ${count}` : label;
}

export function UnderTabs<T extends string>({
  value,
  onChange,
  items,
  accessibilityLabel,
  testID,
  itemTestID,
  spread = false,
}: {
  value: T;
  onChange: (id: T) => void;
  items: readonly UnderTab<T>[];
  accessibilityLabel: string;
  testID: string;
  itemTestID?: (id: T) => string;
  spread?: boolean;
}) {
  const { t } = useTheme();
  const c = t.color;
  const tabs = items.map((it) => {
    const on = it.id === value;
    const text = underTabLabel(it.label, it.count);
    return (
      <Pressable
        key={it.id}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        aria-selected={on}
        accessibilityLabel={text}
        hitSlop={{ top: HIT, bottom: HIT }}
        onPress={() => onChange(it.id)}
        style={[styles.tab, spread ? styles.tabSpread : styles.tabScroll]}
        testID={itemTestID ? itemTestID(it.id) : `${testID}-${it.id}`}
      >
        {it.icon ? <Icon name={it.icon} size={16} color={on ? c.ink : c.inkMuted} /> : null}
        <Text
          variant="caption"
          color={on ? c.ink : c.inkMuted}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={[styles.text, spread && styles.textSpread]}
        >
          {text}
        </Text>
        {on ? <View style={[styles.bar, { backgroundColor: c.accent }]} pointerEvents="none" /> : null}
      </Pressable>
    );
  });
  const rowStyle = [styles.row, spread && styles.rowSpread, { borderBottomColor: c.line }];
  if (spread) {
    return (
      <View style={rowStyle} accessibilityRole="tablist" accessibilityLabel={accessibilityLabel} testID={testID}>
        {tabs}
      </View>
    );
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={styles.scroll}
      contentContainerStyle={[rowStyle, styles.rowScroll]}
    >
      {tabs}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  row: { flexDirection: "row", borderBottomWidth: LINE, alignItems: "stretch" },
  // Rangée qui défile : elle remplit la largeur (`.r8tabs button{flex:1 0 auto}`), le trait va jusqu'au bout.
  rowScroll: { flexGrow: 1 },
  rowSpread: { justifyContent: "space-between" },
  tab: {
    minHeight: TAB_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: space2 + space1 / 2,
  },
  // Rangée qui défile : chaque onglet garde sa largeur de texte. Rangée répartie : les onglets se partagent la place,
  // le libellé passe à la ligne entre deux mots plutôt que d'être coupé.
  tabScroll: { flexGrow: 1, flexShrink: 0 },
  tabSpread: { flexGrow: 0, flexShrink: 1, paddingHorizontal: 6 },
  text: { fontSize: 13.5, lineHeight: 17, fontFamily: archivoAt(100, 750), flexShrink: 1, textAlign: "center" },
  textSpread: { paddingVertical: 2 },
  bar: {
    position: "absolute",
    left: 8,
    right: 8,
    bottom: -LINE,
    height: BAR,
    borderTopLeftRadius: BAR,
    borderTopRightRadius: BAR,
  },
});
