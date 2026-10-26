// Confirmation d'un retrait (navigateur : `window.confirm` ; téléphone : boîte de dialogue du système).
import { crewFeedLabels } from "@orasso/shared";
import { Alert, Platform } from "react-native";

export function confirmRemove(message: string): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(window.confirm(message));
  return new Promise((resolve) =>
    Alert.alert(crewFeedLabels.remove, message, [
      { text: "Annuler", style: "cancel", onPress: () => resolve(false) },
      { text: crewFeedLabels.remove, style: "destructive", onPress: () => resolve(true) },
    ]),
  );
}
