// Échec de lecture d'une page (réseau, serveur) : le message de l'API et « Réessayer ». À ne jamais confondre avec une
// liste vide : sans cet encart, une panne ressemblerait à « aucune candidature ».
import { Button, tokens } from "@orasso/design-system/native";
import { proV2Labels } from "@orasso/shared";
import { View } from "react-native";

import { Notice } from "./Notice";

export function LoadError({ message, onRetry }: { message?: string | null; onRetry: () => void }) {
  return (
    <View style={{ gap: tokens.spacing.space3 }} testID="load-error">
      <Notice tone="error">{message || proV2Labels.loadError}</Notice>
      <Button variant="plate" icon="undo" onPress={onRetry} fullWidth>
        {proV2Labels.retry}
      </Button>
    </View>
  );
}
