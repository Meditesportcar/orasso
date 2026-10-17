// Retour d'une action (lot 35c) : l'erreur de l'API, ou la confirmation, en une ligne sous le bouton. Sur une plaque
// graphite, les couleurs « texte » du Béton (voir `plateText`) ; sur le fond, celles du thème.
import { Text, useTheme } from "@orasso/design-system/native";

import { plateText } from "./plateText";

export function Feedback({
  error,
  notice,
  onPlate = true,
  testID,
}: {
  error?: string | null;
  notice?: string | null;
  onPlate?: boolean;
  testID?: string;
}) {
  const { t } = useTheme();
  if (error) {
    return (
      <Text
        variant="caption"
        color={onPlate ? plateText.alert : t.color.winText}
        accessibilityRole="alert"
        testID={testID ? `${testID}-error` : undefined}
      >
        {error}
      </Text>
    );
  }
  if (notice) {
    return (
      <Text variant="caption" color={onPlate ? t.color.plateInk : t.color.ink} accessibilityRole="text" testID={testID}>
        {notice}
      </Text>
    );
  }
  return null;
}
