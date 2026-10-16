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

import { StaffBackground } from "@/features/staff/StaffBackground";
import { ApplicationsProvider } from "@/lib/applications";
import { kvGet, kvSet } from "@/lib/kv";
import { appLinkOf } from "@/lib/links";
import { PersonaProvider, usePersona } from "@/lib/persona";
import { homeOf, misplacedGroup } from "@/lib/personaModel";
import { registerThisDevice } from "@/lib/push";
import { initSentry } from "@/lib/sentry";
import { SessionProvider, useSession } from "@/lib/session";
import { AnnouncementSheet } from "@/ui/AnnouncementSheet";

// GlitchTip / Sentry (lot 15) : seulement si EXPO_PUBLIC_SENTRY_DSN est renseigné au build.
initSentry();
void SplashScreen.preventAutoHideAsync();

/**
 * Écrans ouverts sans compte : premier lancement, connexion, page d'un événement (lien partagé), d'une structure ou d'un
 * pro (pages publiques du site, lot 29), recette du design.
 */
const PUBLIC_ROOTS = new Set(["welcome", "auth", "e", "o", "p", "ami", "_ds"]);

// Le thème (Béton par défaut, Sable, auto) et les polices Archivo sont posés une fois, à la racine.
function Shell() {
  const { theme } = useTheme();
  const { status } = useSession();
  const { persona, backToFan, choose } = usePersona();
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

  // Chaque casquette a son groupe de routes : si l'URL est dans celui d'une autre (retour arrière, lien profond),
  // on revient au premier écran de la casquette active.
  useEffect(() => {
    if (status !== "in" || !navigation?.key) return;
    if (misplacedGroup(persona, segments[0] as string | undefined)) router.replace(homeOf(persona));
  }, [status, persona, segments, router, navigation?.key]);

  // Appareil enregistré auprès de l'API dès que le compte est ouvert (utile aux notifications et au staff).
  useEffect(() => {
    if (status === "in") void registerThisDevice();
  }, [status]);

  // Toucher une notification ouvre l'onglet Accès du passionné (quelle que soit la casquette active) ou l'écran de son lien.
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      // Décision sur une candidature de prestataire (lot 21) : l'écran Candidatures de la casquette Prestataire.
      if (response.notification.request.content.data?.screen === "provider_applications") {
        choose({ kind: "provider" });
        return;
      }
      backToFan();
      // Un lien de l'appli (profil d'un ami, événement) ouvre cet écran, sinon l'onglet Accès.
      const link = appLinkOf(response.notification.request.content.data?.link);
      if (link) router.navigate(link as never);
      else router.navigate("/acces");
    });
    return () => sub.remove();
  }, [router, backToFan, choose]);

  return (
    <View style={styles.fill}>
      <StatusBar style={theme === "sable" ? "dark" : "light"} />
      {/* Les écrans attendent la lecture de la session : sans jeton, leurs premières requêtes partiraient anonymes. */}
      {status === "loading" ? null : <Stack screenOptions={{ headerShown: false, animation: "none" }} />}
      <AnnouncementSheet />
      {status === "in" ? <StaffBackground /> : null}
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
        <PersonaProvider>
          <ApplicationsProvider>
            <Shell />
          </ApplicationsProvider>
        </PersonaProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
