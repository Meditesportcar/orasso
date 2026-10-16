// Moi, compte public ou privé : les règles d'affichage sont celles de docs/01, mot pour mot (`packages/shared`).
import { Icon, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  profileVisibilities,
  profileVisibilityAlways,
  profileVisibilityLabels,
  profileVisibilityRules,
} from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

import { Muted } from "@/ui/Muted";
import { SectionTitle } from "@/ui/Screens";
import type { SettingsApi } from "./useSettings";

const { space1, space2, space3 } = tokens.spacing;

export function VisibilitySection({ settings, save }: Pick<SettingsApi, "settings" | "save">) {
  const { t } = useTheme();
  return (
    <>
      <SectionTitle>Compte public ou privé</SectionTitle>
      <View accessibilityRole="radiogroup" style={styles.group}>
        {profileVisibilities.map((value) => {
          const selected = settings?.visibility === value;
          return (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              disabled={!settings}
              onPress={() => !selected && void save({ visibility: value })}
              testID={`visibility-${value}`}
            >
              <Plate style={[styles.option, selected && { borderColor: t.color.accent, borderWidth: 2 }]}>
                <View style={styles.optionHead}>
                  <Text variant="bodyStrong" color={t.color.plateInk} style={styles.optionTitle}>
                    {profileVisibilityLabels[value]}
                  </Text>
                  {selected ? <Icon name="check" size={18} strokeWidth={3} color={t.color.accent} /> : null}
                </View>
                <Text variant="body" color={t.color.plateMuted}>
                  {profileVisibilityRules[value]}
                </Text>
              </Plate>
            </Pressable>
          );
        })}
      </View>
      <Muted variant="caption">{profileVisibilityAlways}</Muted>
    </>
  );
}

const styles = StyleSheet.create({
  group: { gap: space2 },
  option: { gap: space1, padding: space3 },
  optionHead: { flexDirection: "row", alignItems: "center", gap: space2 },
  optionTitle: { flex: 1 },
});
