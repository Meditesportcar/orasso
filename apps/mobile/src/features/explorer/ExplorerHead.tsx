// En-tête commun des trois segments de l'Explorer (lot R2, maquette « Explorer R2 », `.xh`) : le segment (Événements,
// Pros, Personnes et crews, `.xseg`), la recherche du segment actif (`.exsearch`), puis une ligne de pastilles qui
// montrent leur valeur (`.pills` / `.pill`) : l'icône, la valeur en gras, ▾. Contour = tes réglages habituels ; plein
// (encre) = une valeur choisie ; nombre moutarde = les filtres actifs. Sur un téléphone étroit, la ligne défile au doigt.
// Il se pose sous la bande ORASSO de l'onglet (décision de Damien du 24/10 : « on garde toujours Orasso »).
import { archivoAt, Icon, type IconName, Text, tokens, useTheme } from "@orasso/design-system/native";
import { explorerR2Labels as R } from "@orasso/shared";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";

import type { ExplorerSegment } from "./explorerChoice";

const { space2, space4 } = tokens.spacing;

const SEGMENTS: { id: ExplorerSegment; label: string }[] = [
  { id: "evenements", label: R.segmentEvents },
  { id: "pros", label: R.segmentPros },
  { id: "personnes", label: R.segmentPeople },
];

/** `.xseg` : trois segments, l'actif en encre. */
export function SegmentBar({ value, onChange }: { value: ExplorerSegment; onChange: (s: ExplorerSegment) => void }) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View
      style={[styles.seg, { backgroundColor: c.surfaceRaised }]}
      accessibilityRole="tablist"
      accessibilityLabel={R.segments}
      testID="explorer-segments"
    >
      {SEGMENTS.map((s) => {
        const on = s.id === value;
        return (
          <Pressable
            key={s.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            aria-selected={on}
            onPress={() => onChange(s.id)}
            style={[styles.segItem, on && { backgroundColor: c.ink }]}
            testID={`segment-${s.id}`}
          >
            <Text variant="caption" color={on ? c.ground : c.inkMuted} style={styles.segText} numberOfLines={1}>
              {s.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** `.exsearch` : la recherche du segment actif, ✕ pour l'effacer. */
export function ExSearch({
  value,
  onChange,
  placeholder,
  testID,
}: {
  value: string;
  onChange: (q: string) => void;
  placeholder: string;
  testID: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View style={[styles.search, { backgroundColor: c.surfaceField, borderColor: c.line }]}>
      <Icon name="search" size={18} color={c.inkMuted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.inkFaint}
        accessibilityLabel={R.searchLabel}
        autoCapitalize="none"
        returnKeyType="search"
        style={[styles.input, { color: c.ink }]}
        testID={testID}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={R.clearSearch}
          onPress={() => onChange("")}
          style={[styles.clear, { backgroundColor: c.surfaceRaised }]}
          testID={`${testID}-clear`}
        >
          <Icon name="close" size={16} color={c.ink} />
        </Pressable>
      ) : null}
    </View>
  );
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

/** `.pill` : 36 px, l'icône, la valeur en gras, ▾. */
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

/** `.pills` : la ligne de pastilles, qui défile au doigt si elle déborde. */
export function PillRow({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.pillsOut}
      contentContainerStyle={styles.pills}
      accessibilityLabel={R.pills}
      testID="explorer-pills"
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: "row", padding: 3, borderRadius: 14, gap: 2 },
  segItem: {
    flexGrow: 1,
    flexShrink: 1,
    height: 38,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 9,
  },
  segText: { fontSize: 13, lineHeight: 16, fontFamily: archivoAt(100, 750) },
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
  input: { flex: 1, minWidth: 0, minHeight: 44, fontSize: 15 },
  clear: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  pillsOut: { marginHorizontal: -space4, flexGrow: 0 },
  pills: { flexDirection: "row", gap: 5, paddingHorizontal: space4, paddingVertical: 1 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 36,
    paddingLeft: 7,
    paddingRight: 8,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  pillKey: { fontSize: 12.5, lineHeight: 15, fontFamily: archivoAt(75, 650) },
  pillValue: { fontSize: 12.5, lineHeight: 15, fontFamily: archivoAt(75, 850) },
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
