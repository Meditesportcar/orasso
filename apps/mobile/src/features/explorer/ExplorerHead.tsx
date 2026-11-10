// En-tête commun des trois segments de l'Explorer (lot R2, maquette « Explorer R2 », `.xh`) : le segment (Événements,
// Pros, Personnes et crews, `.xseg`), la recherche du segment actif (`.exsearch`), puis une ligne de pastilles qui
// montrent leur valeur (`.pills` / `.pill`) : l'icône, la valeur en gras, ▾. Contour = tes réglages habituels ; plein
// (encre) = une valeur choisie ; nombre moutarde = les filtres actifs. Sur un téléphone étroit, la ligne défile au doigt.
// Il se pose sous la bande ORASSO de l'onglet (décision de Damien du 24/10 : « on garde toujours Orasso »).
import { archivoAt, Icon, type IconName, Text, tokens, useTheme } from "@orasso/design-system/native";
import { explorerR2Labels as R } from "@orasso/shared";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { UnderTabs } from "@/ui/UnderTabs";
import type { ExplorerSegment } from "./explorerChoice";

const { space2 } = tokens.spacing;

const SEGMENTS: { id: ExplorerSegment; label: string }[] = [
  { id: "evenements", label: R.segmentEvents },
  { id: "pros", label: R.segmentPros },
  { id: "personnes", label: R.segmentPeople },
];

/**
 * Lot R8x (maquette R8.9, variante A) : les trois segments en onglets soulignés du kit, répartis sur la largeur ;
 * « Événements » porte le nombre de résultats (« Événements · 7 », absent tant qu'il n'est pas connu).
 */
export function SegmentBar({
  value,
  onChange,
  eventsCount,
}: {
  value: ExplorerSegment;
  onChange: (s: ExplorerSegment) => void;
  eventsCount?: number | null;
}) {
  return (
    <UnderTabs
      value={value}
      onChange={onChange}
      items={SEGMENTS.map((s) => ({ ...s, count: s.id === "evenements" ? eventsCount : null }))}
      accessibilityLabel={R.segments}
      testID="explorer-segments"
      itemTestID={(id) => `segment-${id}`}
      spread
    />
  );
}

/** `.r8srch` : la recherche du segment actif (40 px, rayon 12), ✕ pour l'effacer. */
export function ExSearch({
  value,
  onChange,
  placeholder,
  testID,
  compact = false,
}: {
  value: string;
  onChange: (q: string) => void;
  placeholder: string;
  testID: string;
  /** Lot R8x : le champ de l'Explorer (40 px) ; sans cela, le champ habituel (48 px) des autres écrans. */
  compact?: boolean;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View
      style={[styles.search, compact && styles.searchCompact, { backgroundColor: c.surfaceField, borderColor: c.line }]}
    >
      <Icon name="search" size={compact ? 16 : 18} color={c.inkMuted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.inkFaint}
        accessibilityLabel={R.searchLabel}
        autoCapitalize="none"
        returnKeyType="search"
        style={[styles.input, compact && styles.inputCompact, { color: c.ink }]}
        testID={testID}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={R.clearSearch}
          onPress={() => onChange("")}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          style={[styles.clear, compact && styles.clearCompact, { backgroundColor: c.surfaceRaised }]}
          testID={`${testID}-clear`}
        >
          <Icon name="close" size={16} color={c.ink} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** `.r8ib` : le bouton icône « Filtres » (40 px, rayon 12) ; la pastille moutarde dit combien de filtres sont actifs. */
export function FilterButton({
  count,
  set = false,
  onPress,
  testID,
}: {
  count?: number;
  /** Au moins un filtre choisi : le bouton passe en encre. */
  set?: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${R.filters}${count ? ` · ${count}` : ""}`}
      accessibilityState={{ selected: set }}
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      onPress={onPress}
      style={[
        styles.filterBtn,
        set ? { backgroundColor: c.ink, borderColor: c.ink } : { backgroundColor: c.surfaceField, borderColor: c.line },
      ]}
      testID={testID}
    >
      <Icon name="filter" size={18} color={set ? c.ground : c.ink} />
      {count ? (
        <View style={[styles.filterCount, { backgroundColor: c.accent }]}>
          <Text variant="caption" color={c.accentInk} style={styles.countText}>
            {count}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** La ligne de recherche : le champ, et à sa droite le bouton « Filtres » quand le segment en a. */
export function SearchLine({ children }: { children: ReactNode }) {
  return <View style={styles.searchLine}>{children}</View>;
}

export type PillProps = {
  icon: IconName;
  /** « Métier », « Montrer » : le nom du réglage, en clair avant la valeur. */
  k?: string;
  value: string;
  /** Une valeur choisie (plein, encre) ; sinon le réglage habituel (contour). */
  set?: boolean;
  /** Le nombre de filtres actifs (moutarde). */
  count?: number;
  onPress: () => void;
  testID: string;
};

/** `.pill` : l'icône, la valeur en gras, ▾ ; serrée (32 px, maquette R8.9) dans le haut de l'Explorer. */
export function Pill({ icon, k, value, set = false, count, onPress, testID }: PillProps) {
  const { t } = useTheme();
  const c = t.color;
  const fg = set ? c.ground : c.ink;
  // `.pill.set .k` : la couleur du fond d'écran, atténuée.
  const muted = set ? c.ground : c.inkMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${k ? `${k} : ` : ""}${value}${count ? ` · ${count}` : ""}`}
      accessibilityState={{ selected: set }}
      hitSlop={{ top: 8, bottom: 8 }}
      onPress={onPress}
      style={[
        styles.pill,
        set ? { backgroundColor: c.ink, borderColor: c.ink } : { backgroundColor: c.surface, borderColor: c.line },
      ]}
      testID={testID}
    >
      <Icon name={icon} size={14} color={fg} />
      {k ? (
        <Text variant="caption" color={muted} style={[styles.pillKey, set && styles.dim]}>
          {`${k} :`}
        </Text>
      ) : null}
      <Text variant="caption" color={fg} style={styles.pillValue}>
        {value}
      </Text>
      {count ? (
        <View style={[styles.count, { backgroundColor: c.accent }]}>
          <Text variant="caption" color={c.accentInk} style={styles.countText}>
            {count}
          </Text>
        </View>
      ) : null}
      <View style={styles.dim}>
        <Icon name="down" size={12} color={muted} />
      </View>
    </Pressable>
  );
}

/** `.r8exrow.tight` : les pastilles serrées ; elles passent à la ligne plutôt que de défiler. */
export function PillRow({ children }: { children: ReactNode }) {
  return (
    <View style={styles.pills} accessibilityLabel={R.pills} testID="explorer-pills">
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  searchLine: { flexDirection: "row", alignItems: "center", gap: space2 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: space2,
    height: 48,
    paddingLeft: 12,
    paddingRight: 6,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  // `.r8srch` : 40 px, rayon 12, dans la ligne de recherche (le champ prend la largeur que le bouton laisse).
  searchCompact: { flex: 1, minWidth: 0, height: 40, paddingRight: 4, borderRadius: tokens.radius.radiusMd },
  input: { flex: 1, minWidth: 0, minHeight: 44, fontSize: 15 },
  inputCompact: { minHeight: 36, fontSize: 13, paddingVertical: 0 },
  clear: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  clearCompact: { width: 30, height: 30, borderRadius: tokens.radius.radiusSm },
  filterBtn: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.radiusMd,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  filterCount: {
    position: "absolute",
    top: -6,
    right: -6,
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    minHeight: 32,
    maxWidth: "100%",
    paddingLeft: 7,
    paddingRight: 8,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  pillKey: { fontSize: 12, lineHeight: 15, fontFamily: archivoAt(75, 650) },
  pillValue: { fontSize: 12, lineHeight: 15, fontFamily: archivoAt(75, 850) },
  count: {
    minWidth: 19,
    height: 19,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  dim: { opacity: 0.72 },
  countText: { fontSize: 11, lineHeight: 13, fontFamily: archivoAt(80, 900) },
});
