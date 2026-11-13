// Passer de « Publication » à « Story » avec un brouillon en cours (lot R9n, tour 1, point 6) : on demande avant de l'abandonner.
import { casquettesLabels as L } from "@orasso/shared";
import { Alert, Platform } from "react-native";

export function confirmSwitchToStory(): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(window.confirm(`${L.switchTitle} ${L.switchBody}`));
  return new Promise((resolve) =>
    Alert.alert(L.switchTitle, L.switchBody, [
      { text: L.switchStay, style: "cancel", onPress: () => resolve(false) },
      { text: L.switchGo, style: "destructive", onPress: () => resolve(true) },
    ]),
  );
}
