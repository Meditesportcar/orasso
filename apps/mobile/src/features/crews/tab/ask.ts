// Confirmation dans l'onglet Crew (navigateur : `window.confirm` ; téléphone : boîte de dialogue du système).
import { crewLabels } from "@orasso/shared";
import { Alert, Platform } from "react-native";

export function ask(message: string): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(window.confirm(message));
  return new Promise((resolve) =>
    Alert.alert(crewLabels.crew, message, [
      { text: "Annuler", style: "cancel", onPress: () => resolve(false) },
      { text: "Confirmer", style: "destructive", onPress: () => resolve(true) },
    ]),
  );
}
