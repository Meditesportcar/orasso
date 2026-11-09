// Ligne de la Boîte (lot C2a, artefact DA v2 `.cap` de `sh-inbox`) : carte rayon 16, logo ou avatar 44 px, nom en gras,
// aperçu en `.t-cap`, pastille moutarde `.cnt` à droite.
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

const { space3 } = tokens.spacing;

/** Pastille moutarde à plat (`.cnt`). */
export function Count({ n }: { n: number }) {
  const { t } = useTheme();
  return (
    <View style={[styles.count, { backgroundColor: t.color.accent }]}>
      <Text variant="label" color={t.color.accentInk} style={styles.countText}>
        {n}
      </Text>
    </View>
  );
}

/** Une ligne `.cap` : carte, rayon 16, padding 12. */
export function CapRow({
  leading,
  title,
  lines,
  trailing,
  onPress,
  testID,
}: {
  leading: ReactNode;
  title: string;
  lines: (string | null | undefined)[];
  trailing?: ReactNode;
  onPress?: () => void;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "link" : undefined}
      accessibilityLabel={title}
      testID={testID}
      style={[styles.cap, { backgroundColor: c.surface }]}
    >
      {leading}
      <View style={styles.capText}>
        <Text variant="bodyStrong" color={c.ink} style={styles.capTitle}>
          {title}
        </Text>
        {lines
          .filter((l): l is string => Boolean(l))
          .map((l) => (
            <Text key={l} variant="caption" color={c.inkMuted} numberOfLines={2}>
              {l}
            </Text>
          ))}
      </View>
      {trailing}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cap: { flexDirection: "row", alignItems: "center", gap: space3, padding: space3, borderRadius: 16 },
  capText: { flex: 1, gap: 2 },
  capTitle: { fontWeight: "800" },
  count: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { fontSize: 12, lineHeight: 14 },
});
