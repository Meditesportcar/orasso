// Mode staff (docs/02 « Mode staff (détail) ») : plein écran, pour un événement, thème Sable imposé (plein soleil,
// parking) quel que soit le thème choisi dans l'appli ; quittable d'un geste ; fermé à J+1.
import { ThemeScope } from "@orasso/design-system/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function StaffLayout() {
  return (
    <ThemeScope theme="sable">
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, animation: "none" }} />
    </ThemeScope>
  );
}
