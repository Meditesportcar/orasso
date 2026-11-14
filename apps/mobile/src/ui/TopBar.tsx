// La bande ORASSO du mode A (navigation, lot M7 ; DA v2, lot 40, artefact `.appbar.home` ; `AppBar kind="tab"` du
// système de design) : le logotype toujours à gauche, la pastille de la casquette quand ce n'est pas la casquette de
// base (logo de la structure pour l'organisateur), puis Recherche, la cloche « Activité » et la bulle « Messages » à
// droite. L'avatar a quitté la barre : il est dans Mon profil. Appui long sur le logotype : retour à la casquette de base
// (exposant ou visiteur) ; appui sur la pastille : Mon profil de la casquette de base.
// Lot R7a1 (D38) puis lot R7c2 : la Boîte a disparu. La cloche ouvre `/activite` (nouveautés depuis la dernière ouverture,
// plus les demandes en attente), la bulle `/messages` (conversations non lues, plus les demandes de message), chacune avec
// sa pastille (`topBarCounts`). Lot R9d : l'organisateur a les mêmes deux icônes, celles de sa structure : la cloche ouvre
// `/activite/orga` (nouveautés, demandes de staff et de collaboration), la bulle `/messages/orga` (conversations), chacune avec
// sa pastille (`structureTopBarCounts`) ; il n'y a plus de Boîte.
// Lot C1 (artefact DA v2, `.capchip`) : la pastille « Organisateur » (logo de la structure) seulement pour
// l'organisateur (et l'Administration, sans onglet Profil : la pastille est son seul retour).
// Lot M7 (deux modes d'affichage) : le layout d'un groupe d'onglets (`PersonaTabs`) pose la bande une fois
// (`TabBandProvider`) : une seule lecture des compteurs et de la casquette pour tous les onglets, donc une bande
// identique d'un onglet à l'autre, qui ne saute pas au glissement. Chaque page d'onglet l'affiche à la même place, hors
// de la zone qui glisse (`TabScreen`, `TabStage`), sous ses feuilles (règle du socle C1 : une feuille couvre les deux
// bandes). Hors d'un groupe d'onglets, pas de bande : l'écran est en mode B (en-tête de fiche, `FicheHeader`).
import { AppBar, type AppBarProps } from "@orasso/design-system/native";
import { casquettesLabels, structureTopBarCounts, topBarCounts } from "@orasso/shared";
import { useRouter } from "expo-router";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { openCasquettes } from "@/features/casquettes/sheetStore";
import { api } from "@/lib/api";
import { mutationCount } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { usePersona } from "@/lib/persona";
import { homeOf, personaKindLabels, tabHref } from "@/lib/personaModel";
import { useChannel } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";

type Band = Pick<
  AppBarProps,
  | "persona"
  | "onPersona"
  | "onLogo"
  | "onLogoLongPress"
  | "logoHint"
  | "onSearch"
  | "onActivity"
  | "activityCount"
  | "onMessages"
  | "messagesCount"
>;

type BandValue = { band: Band; refresh: () => void };

const TabBandContext = createContext<BandValue | null>(null);

/** La bande du groupe d'onglets : lue une fois par le layout, affichée par chaque page d'onglet. */
export function TabBandProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { me } = useSession();
  const { persona, base, active, choose, backToBase } = usePersona();
  // Lot R9n (maquette `appbar2`) : la pastille de la casquette pour les quatre casquettes de page (logo seul, elle ouvre « Mes
  // casquettes ») et pour l'Administration (hors artefact, sans onglet Profil : la pastille est son seul retour).
  const isPageKind =
    persona.kind === "organizer" || persona.kind === "pro" || persona.kind === "provider" || persona.kind === "media";
  // Le survol en assistance garde l'ancien geste (retour par la bannière) : jamais « Mes casquettes » au nom d'une structure survolée.
  const isPage = isPageKind && !active.assisted;
  const showPersona = isPageKind || persona.kind === "admin";
  // Organisateur : les compteurs de sa structure (Activité : nouveautés et demandes ; Messages : conversations).
  const structureId = persona.kind === "organizer" ? persona.structureId : null;
  const orgInbox = useApi(() => api.orgInboxSummary(structureId ?? ""), [structureId], {
    enabled: structureId !== null && !active.assisted,
    refreshMs: 60_000,
  });
  // Lot M7, tour 2 (relecture Codex) : le résumé est lu au-dessus des onglets, dont le focus est celui du groupe. Une
  // page d'onglet qui s'affiche le relit donc elle-même, mais seulement si une modification est partie depuis la
  // dernière lecture (demande de staff acceptée, message lu) : une seule requête par changement, pas une par onglet.
  const seen = useRef(mutationCount());
  const reloadInbox = orgInbox.reload;
  // Lot R7c2 : la cloche et la bulle sont celles de la personne, quelle que soit sa casquette (R9d : l'organisateur a celles de
  // sa structure, lues dans `orgInbox`). Les deux pastilles viennent du résumé (`GET /me/inbox/summary`), relu quand les compteurs
  // du profil changent (message lu, demande traitée, Activité ouverte), au retour sur le groupe d'onglets et à chaque
  // événement du compte (`inbox.changed`, `conversation.updated`, `notification`).
  const personal = persona.kind !== "organizer";
  const userId = me?.user.id ?? null;
  const summary = useApi(
    () => api.inboxSummary(),
    [userId, me?.unreadInbox, me?.counts.unseenActivity, me?.counts.pendingRequests],
    { enabled: personal && userId !== null },
  );
  const reloadSummary = summary.reload;
  // Lot R9d : l'organisateur écoute le même canal pour les pastilles de sa structure (cloche : Activité, bulle : Messages).
  useChannel(userId ? `user:${userId}` : null, (event) => {
    if (event.type === "inbox.changed" || event.type === "conversation.updated" || event.type === "notification") {
      if (personal) void reloadSummary();
      else void reloadInbox();
    }
  });
  const refresh = useCallback(() => {
    const now = mutationCount();
    if (now === seen.current) return;
    seen.current = now;
    void reloadInbox();
    void reloadSummary();
  }, [reloadInbox, reloadSummary]);
  // Lot R9d : organisateur, la cloche est l'Activité de la structure (nouveautés, demandes de staff et de collaboration) et la
  // bulle ses Messages (conversations seulement) : `structureTopBarCounts`. Plus de Boîte.
  const orgCounts = structureTopBarCounts(orgInbox.data);
  // Cloche : nouveautés depuis la dernière ouverture et demandes en attente ; bulle : conversations non lues et demandes de
  // message en attente (une demande ne compte qu'une fois : voir `topBarCounts`).
  const { activity: activityCount, messages: messagesCount } = topBarCounts(summary.data);
  const baseLabel = personaKindLabels[base.kind];

  const band = useMemo<Band>(
    () => ({
      persona: showPersona
        ? {
            // Adresse relative de l'API (`/api/files/…`) : sans l'hôte de l'API, la pastille restait un disque vide.
            logoUrl: mediaSource(active.logoUrl)?.uri ?? null,
            label: active.label,
            // Les casquettes de page : le logo seul (le nom est dans la feuille) ; l'Administration garde son libellé.
            ...(isPage
              ? { hint: casquettesLabels.chipHint }
              : { role: personaKindLabels[persona.kind], hint: "Ouvre Mon profil" }),
          }
        : undefined,
      onPersona: isPage ? openCasquettes : () => choose(base, tabHref(base.kind, "profil") ?? undefined),
      onLogo: () => router.navigate(homeOf(persona) as never),
      onLogoLongPress: persona.kind === base.kind ? undefined : backToBase,
      logoHint: `Appui long : revenir au profil ${baseLabel.toLowerCase()}`,
      onSearch: () => router.push("/recherche"),
      ...(personal
        ? {
            onActivity: () => router.push("/activite"),
            activityCount,
            onMessages: () => router.push("/messages"),
            messagesCount,
          }
        : {
            onActivity: () => router.push("/activite/orga"),
            activityCount: orgCounts.activity,
            onMessages: () => router.push("/messages/orga"),
            messagesCount: orgCounts.messages,
          }),
    }),
    [
      showPersona,
      isPage,
      active.logoUrl,
      active.label,
      persona,
      base,
      baseLabel,
      choose,
      backToBase,
      router,
      personal,
      activityCount,
      messagesCount,
      orgCounts.activity,
      orgCounts.messages,
    ],
  );

  const value = useMemo(() => ({ band, refresh }), [band, refresh]);
  return <TabBandContext.Provider value={value}>{children}</TabBandContext.Provider>;
}

/** L'écran est-il une page d'un groupe d'onglets (mode A) ? */
export function useInTabs(): boolean {
  return useContext(TabBandContext) !== null;
}

/** Relit le compteur de la Boîte de la structure s'il a pu changer (à l'arrivée sur une page d'onglet). */
export function useTabBandRefresh(): () => void {
  const value = useContext(TabBandContext);
  return value?.refresh ?? noop;
}

const noop = () => {};

/** La bande ORASSO, telle que le groupe d'onglets l'a posée ; rien hors d'un groupe d'onglets. */
export function TopBar() {
  const value = useContext(TabBandContext);
  const insets = useSafeAreaInsets();
  if (!value) return null;
  return <AppBar kind="tab" safeTop={insets.top} {...value.band} />;
}
