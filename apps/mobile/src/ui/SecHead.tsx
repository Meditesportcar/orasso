// Titre de section avec, à droite, un mot d'aide (prototype `sec-h` : « Remises par grade · Montre ton QR de compte »).
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { StyleSheet, View } from "react-native";

import { Muted } from "./Muted";

const { space2 } = tokens.spacing;

export function SecHead({ title, hint }: { title: string; hint?: string }) {
  const { t } = useTheme();
  return (
    <View style={styles.row}>
      <Text variant="title" color={t.color.ink} accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      {hint ? (
        <Muted variant="caption" style={styles.hint}>
          {hint}
        </Muted>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: space2,
    marginTop: space2,
  },
  title: { flexShrink: 1 },
  hint: { flexShrink: 1, textAlign: "right" },
});
