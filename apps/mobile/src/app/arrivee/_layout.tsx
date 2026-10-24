// Flux d'arrivée (lot 41) : Tu viens comment ? › Ton coin › Qui es-tu ? › tuto (lot 42). Écrans publics (sans compte).
import { useTheme } from "@orasso/design-system/native";
import { Stack } from "expo-router";

// Lot R3d : le brouillon de l'arrivée gardé sur l'appareil est relu dès que le flux s'ouvre.
import "@/features/arrivee/persist";

export default function ArriveeLayout() {
  const { t } = useTheme();
  return (
    <Stack
      screenOptions={{ headerShown: false, animation: "none", contentStyle: { backgroundColor: t.color.ground } }}
    />
  );
}
