import {
  OpeningBattle,
  parseThemePreference,
  type ThemePreference,
  ThemeProvider,
  useOrassoFonts,
  useTheme,
} from "@orasso/design-system/native";
import { profilePosition } from "@orasso/shared";
import * as Notifications from "expo-notifications";
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
  Stack,
  useGlobalSearchParams,
  useRootNavigationState,
  useRouter,
  useSegments,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { StampArrival } from "@/features/passport/StampArrival";
import { ReportSheetHost } from "@/features/ReportSheet";
import { StaffBackground } from "@/features/staff/StaffBackground";
import { adminLinkOf } from "@/lib/adminModel";
import { ApplicationsProvider } from "@/lib/applications";
import { initClock } from "@/lib/clockStore";
import { kvGet, kvSet } from "@/lib/kv";
import { appLinkOf, teamRequestTarget } from "@/lib/links";
import { MotionPrefProvider, parseReduceMotion, REDUCE_MOTION_KEY } from "@/lib/motionPref";
import { PersonaProvider, usePersona } from "@/lib/persona";
import { misplacedTarget } from "@/lib/personaModel";
import { registerThisDevice } from "@/lib/push";
import { initSentry } from "@/lib/sentry";
import { SessionProvider, useSession } from "@/lib/session";
import { AnnounceHost } from "@/ui/Announce";
import { AnnouncementsBridge } from "@/ui/AnnouncementsBridge";
import { ClockBanner } from "@/ui/ClockBanner";

// GlitchTip / Sentry (lot 15) : seulement si EXPO_PUBLIC_SENTRY_DSN est renseigné au build.
initSentry();
void SplashScreen.preventAutoHideAsync();

/**
 * Écrans ouverts sans compte : flux d'arrivée (lot 41), connexion, page d'un événement (lien partagé), d'une structure ou d'un
 * pro (pages publiques du site, lot 29), recette du design.
 */
const PUBLIC_ROOTS = new Set(["arrivee", "auth", "e", "o", "p", "ami", "_ds", "verification-email"]);

// Le thème (Béton par défaut, Sable, auto) et les polices Archivo sont posés une fois, à la racine.
function Shell() {
  const { theme, t, setPosition } = useTheme();
  const { status, me } = useSession();
  // Thème « Automatique » (lot 38) : le soleil au centre du premier département de l'utilisateur (Paris sinon).
  const firstDepartment = me?.profile.departments[0];
  useEffect(() => {
    setPosition(firstDepartment ? profilePosition([firstDepartment]) : null);
  }, [firstDepartment, setPosition]);
  const { persona, backToBase, choose, entries } = usePersona();
  const router = useRouter();
  const segments = useSegments();
  const navigation = useRootNavigationState();
  const [opening, setOpening] = useState(true);

  // Lot 36 (bande blanche en bas d'écran sur Android, bord à bord) : sous les écrans, la navigation peignait son fond
  // par défaut (blanc) — zone de la barre d'onglets au-dessus du métal, ses coins arrondis, et tout écran qui ne
  // couvre pas la barre système. Le fond suit maintenant le thème partout : vue racine du système (expo-system-ui),
  // thème de la navigation (fond et cartes) et conteneur racine.
  const ground = t.color.ground;
  const navigationTheme = useMemo(() => {
    const base = theme === "sable" ? DefaultTheme : DarkTheme;
    return { ...base, colors: { ...base.colors, background: ground, card: ground, border: ground } };
  }, [theme, ground]);
  useEffect(() => {
    if (Platform.OS !== "web") void SystemUI.setBackgroundColorAsync(ground).catch(() => undefined);
  }, [ground]);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    void kvGet("onboarded").then((v) => {
      // Lot C3 : l'ouverture de 3 s se décide une fois, au lancement : jamais au tout premier (l'accueil `/arrivee` joue
      // la battle), et une relecture plus tard (après l'inscription) ne la fait pas apparaître.
      if (v !== "1") setOpening(false);
      setOnboarded(v === "1");
    });
    // Dernier décalage de l'horloge simulée connu (mode staff hors ligne) ; 0 et sans effet hors développement.
    void initClock();
  }, []);

  // Le compte créé ou ouvert pose « onboarded » : relu à chaque changement de session, pour qu'une déconnexion après
  // l'inscription mène à la connexion et non à l'accueil du premier lancement (relecture du lot C3).
  useEffect(() => {
    if (status === "loading") return;
    void kvGet("onboarded").then((v) => setOnboarded(v === "1"));
  }, [status]);

  // Déconnecté (ou jamais connecté) : seuls les écrans publics restent accessibles.
  useEffect(() => {
    if (status !== "out" || onboarded === null || !navigation?.key) return;
    const root = segments[0] as string | undefined;
    if (root && PUBLIC_ROOTS.has(root)) return;
    router.replace(onboarded ? "/auth" : "/arrivee");
  }, [status, onboarded, segments, router, navigation?.key]);

  // Chaque casquette a son groupe de routes : si l'URL est dans celui d'une autre (retour arrière, lien profond),
  // on revient au premier écran de la casquette active ; exposant ↔ visiteur (véhicule ajouté ou archivé), au même
  // onglet de la nouvelle barre, sinon à son Profil (lot 40).
  useEffect(() => {
    if (status !== "in" || !navigation?.key) return;
    const target = misplacedTarget(persona, segments as string[]);
    if (target) router.replace(target as never);
  }, [status, persona, segments, router, navigation?.key]);

  // Lot 32 : compte suspendu → l'écran « Compte suspendu » (motif, contestation) s'ouvre une fois par lancement.
  const suspendedShown = useRef(false);
  useEffect(() => {
    if (status !== "in" || !navigation?.key || !me?.suspension || suspendedShown.current) return;
    suspendedShown.current = true;
    router.push("/suspendu");
  }, [status, me?.suspension, router, navigation?.key]);

  // Appareil enregistré auprès de l'API dès que le compte est ouvert (utile aux notifications et au staff).
  useEffect(() => {
    if (status === "in") void registerThisDevice();
  }, [status]);

  // Cible d'une notification média reçue avant le chargement des casquettes (démarrage à froid), ouverte dès qu'elles sont là.
  const pendingMedia = useRef<string | null>(null);
  useEffect(() => {
    const media = entries.find((e) => e.kind === "media");
    if (!pendingMedia.current || !media) return;
    const target = pendingMedia.current;
    pendingMedia.current = null;
    choose({ kind: "media", mediaProfileId: media.id }, target);
  }, [entries, choose]);

  // Toucher une notification ouvre l'onglet Sorties de la casquette de base (quelle que soit la casquette active) ou
  // l'écran de son lien. Lot M6 : le même chemin sert au bandeau d'annonce (notification reçue pendant l'utilisation).
  const openNotification = useCallback(
    (data: Record<string, unknown> | undefined) => {
      // Décision sur une candidature de prestataire (lot 21) : l'écran Candidatures de la casquette Prestataire.
      if (data?.screen === "provider_applications") {
        choose({ kind: "provider" }, "/(provider)/candidatures");
        return;
      }
      // Décision sur une accréditation presse, contenu mis en avant (lot 55) : Presse ou Contenus de la casquette Média.
      const screen = data?.screen;
      if (screen === "media_accreditations" || screen === "media_contents") {
        const target = screen === "media_contents" ? "/(media)/contenus" : "/(media)/presse";
        const media = entries.find((e) => e.kind === "media");
        if (media) choose({ kind: "media", mediaProfileId: media.id }, target);
        // Démarrage à froid : les casquettes ne sont pas encore lues ; on garde la cible, jamais l'écran d'Accès (passionné).
        else pendingMedia.current = target;
        return;
      }
      // Demande pour devenir staff (lot 35a) : l'écran Équipe de la structure, sous la casquette Organisateur.
      const team = teamRequestTarget(data);
      if (team) {
        choose({ kind: "organizer", structureId: team }, "/(orga)/equipe");
        return;
      }
      // Alerte de modération ou demande d'aide d'une structure (lot 35d) : l'écran de la casquette Administration.
      const admin = adminLinkOf(data?.link);
      if (admin) {
        choose({ kind: "admin" }, admin);
        return;
      }
      backToBase();
      // Un lien de l'appli (profil d'un ami, événement) ouvre cet écran, sinon l'onglet Sorties (`/acces` y redirige).
      const link = appLinkOf(data?.link);
      if (link) router.navigate(link as never);
      else router.navigate("/acces");
    },
    [router, backToBase, choose, entries],
  );
  useEffect(() => {
    if (Platform.OS === "web") return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) =>
      openNotification(response.notification.request.content.data),
    );
    return () => sub.remove();
  }, [openNotification]);

  return (
    <View style={[styles.fill, { backgroundColor: ground }]}>
      <StatusBar style={theme === "sable" ? "dark" : "light"} />
      {/* Lot 34a : bandeau de l'horloge simulée (rien hors développement). */}
      <ClockBanner />
      {/* Les écrans attendent la lecture de la session : sans jeton, leurs premières requêtes partiraient anonymes. */}
      <NavigationThemeProvider value={navigationTheme}>
        {status === "loading" || onboarded === null ? null : (
          <Stack screenOptions={{ headerShown: false, animation: "none", contentStyle: { backgroundColor: ground } }}>
            {/* Lot C2a : la Boîte est une feuille (`sh-inbox`) par-dessus l'écran d'où l'on vient. */}
            <Stack.Screen
              name="boite/index"
              options={{
                presentation: "transparentModal",
                animation: "fade",
                contentStyle: { backgroundColor: "transparent" },
              }}
            />
          </Stack>
        )}
      </NavigationThemeProvider>
      {/* Lot M6 : les annonces arrivent par un seul bandeau en haut (voir ui/Announce.tsx). */}
      {status === "in" ? <AnnouncementsBridge onOpenNotification={openNotification} /> : null}
      {/* Lot 50 : le tampon du passeport qui tombe au pointage, au-dessus de tout écran et de ses feuilles. */}
      {status === "in" ? <StampArrival /> : null}
      {/* Lot 32 : feuille « Signaler », une pour toute l'appli. */}
      {status === "in" ? <ReportSheetHost /> : null}
      {status === "in" ? <StaffBackground /> : null}
      {/* Le bandeau d'annonce, au-dessus des écrans et de leurs feuilles. */}
      <AnnounceHost />
      {/* Lot 39 (V12) : la battle en tandem de 3 s à chaque lancement (fondu de 120 ms si animations réduites). Lot C3 :
          pas au premier lancement, où l'accueil (`/arrivee`, artefact `s-splash`) joue lui-même la battle autour du O. */}
      {/* Rien avant la lecture d'« onboarded » (pas d'éclair de l'ouverture au premier lancement, ni de l'écran ensuite). */}
      {opening && onboarded === true ? (
        <View style={StyleSheet.absoluteFill}>
          <OpeningBattle onDone={() => setOpening(false)} />
        </View>
      ) : null}
    </View>
  );
}

export default function RootLayout() {
  const fontsReady = useOrassoFonts();
  const [preference, setPreference] = useState<ThemePreference | null>(null);
  // Lot 40 : « Réduire les animations » de Mon profil › Préférences (kv), en plus du réglage de l'appareil.
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  // Recette : /_ds?reduce=1 force « réduire les animations » (sinon, la préférence puis le réglage de l'appareil).
  const { reduce } = useGlobalSearchParams<{ reduce?: string }>();

  useEffect(() => {
    void kvGet("theme").then((v) => setPreference(parseThemePreference(v)));
    void kvGet(REDUCE_MOTION_KEY).then((v) => setReduceMotion(parseReduceMotion(v)));
  }, []);

  const ready = fontsReady && preference !== null && reduceMotion !== null;
  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  return (
    <MotionPrefProvider value={reduceMotion ?? false} onChange={setReduceMotion}>
      <ThemeProvider
        initialPreference={preference}
        onPreferenceChange={(next) => void kvSet("theme", next)}
        reducedMotion={reduce === "1" || reduceMotion ? true : undefined}
      >
        <SessionProvider>
          <PersonaProvider>
            <ApplicationsProvider>
              <Shell />
            </ApplicationsProvider>
          </PersonaProvider>
        </SessionProvider>
      </ThemeProvider>
    </MotionPrefProvider>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
