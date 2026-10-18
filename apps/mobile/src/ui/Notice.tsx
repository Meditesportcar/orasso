// Encart d'information ou d'erreur : plaque à bordure pointillée, texte clair (jamais une icône seule).
import { Plate, Text, useTheme } from "@orasso/design-system/native";
import type { ReactNode } from "react";

import { plateText } from "./plateText";

export function Notice({
  children,
  tone = "info",
  testID,
}: {
  children: ReactNode;
  tone?: "info" | "error";
  testID?: string;
}) {
  const { t } = useTheme();
  return (
    <Plate kind="note" accessibilityRole={tone === "error" ? "alert" : undefined} testID={testID}>
      <Text variant="body" color={tone === "error" ? plateText.alert : t.color.plateInk}>
        {children}
      </Text>
    </Plate>
  );
}
