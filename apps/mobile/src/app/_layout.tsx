import {
  OpeningScreen,
  parseThemePreference,
  type ThemePreference,
  ThemeProvider,
  useOrassoFonts,
  useTheme,
} from "@orasso/design-system/native";
import * as Notifications from "expo-notifications";
import { Stack, useGlobalSearchParams, useRootNavigationState, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";

import { ApplicationsProvider } from "@/lib/applications";
import { kvGet, kvSet } from "@/lib/kv";
import { registerThisDevice } from "@/lib/push";
import { SessionProvider, useSession } from "@/lib/session";
import { AnnouncementSheet } from "@/ui/AnnouncementSheet";

void SplashScreen.preventAutoHideAsync();

/** Écrans ouverts sans compte : premier lancement, connexion, page d'un événement (lien partagé), recette du design. */
const PUBLIC_ROOTS = new Set(["welcome", "auth", "e", "_ds"]);

// Le thème (Béton par défaut, Sable, auto) et les polices Archivo sont posés une fois, à la racine.
function Shell() {
  const { theme } = useTheme();
  const { status } = useSession();
  const router = useRouter();
  const segments = useSegments();
  const navigation = useRootNavigationState();
  const [opening, setOpening] = useState(true);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    void kvGet("onboarded").then((v) => setOnboarded(v === "1"));
  }, []);

  // Déconnecté (ou jamais connecté) : seuls les écrans publics restent accessibles.
  useEffect(() => {
    if (status !== "out" || onboarded === null || !navigation?.key) return;
    const root = segments[0] as string | undefined;
    if (root && PUBLIC_ROOTS.has(root)) return;
    router.replace(onboarded ? "/auth" : "/welcome");
  }, [status, onboarded, segments, router, navigation?.key]);

  // Appareil enregistré auprès de l'API dès que le compte est ouvert (utile aux notifications et au staff).
  useEffect(() => {
    if (status === "in") void registerThisDevice();
  }, [status]);

  // Toucher une notification ouvre l'onglet Accès.
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = Notifications.addNotificationResponseReceivedListener(() => router.navigate("/acces"));
    return () => sub.remove();
  }, [router]);

  return (
    <View style={styles.fill}>
      <StatusBar style={theme === "sable" ? "dark" : "light"} />
      {/* Les écrans attendent la lecture de la session : sans jeton, leurs premières requêtes partiraient anonymes. */}
      {status === "loading" ? null : <Stack screenOptions={{ headerShown: false, animation: "none" }} />}
      <AnnouncementSheet />
      {opening ? (
        <View style={StyleSheet.absoluteFill}>
          <OpeningScreen onDone={() => setOpening(false)} />
        </View>
      ) : null}
    </View>
  );
}

export default function RootLayout() {
  const fontsReady = useOrassoFonts();
  const [preference, setPreference] = useState<ThemePreference | null>(null);
  // Recette : /_ds?reduce=1 force « réduire les animations » (sinon, le réglage de l'appareil).
  const { reduce } = useGlobalSearchParams<{ reduce?: string }>();

  useEffect(() => {
    void kvGet("theme").then((v) => setPreference(parseThemePreference(v)));
  }, []);

  const ready = fontsReady && preference !== null;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  return (
    <ThemeProvider
      initialPreference={preference}
      onPreferenceChange={(next) => void kvSet("theme", next)}
      reducedMotion={reduce === "1" ? true : undefined}
    >
      <SessionProvider>
        <ApplicationsProvider>
          <Shell />
        </ApplicationsProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
