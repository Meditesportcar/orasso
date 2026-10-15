import { ThemeProvider, useOrassoFonts, useTheme } from "@orasso/design-system/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

// Le thème (Béton par défaut, Sable, auto) et les polices Archivo sont posés une fois, à la racine.
// L'appli attend les polices avant d'afficher (écran d'ouverture : lot 09).
function Shell() {
  const { theme } = useTheme();
  return (
    <>
      <StatusBar style={theme === "sable" ? "dark" : "light"} />
      <Stack screenOptions={{ headerShown: false, animation: "none" }} />
    </>
  );
}

export default function RootLayout() {
  const fontsReady = useOrassoFonts();
  if (!fontsReady) return null;
  return (
    <ThemeProvider>
      <Shell />
    </ThemeProvider>
  );
}
