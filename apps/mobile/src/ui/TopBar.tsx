// La bande ORASSO du mode A (navigation, lot M7 ; DA v2, lot 40, artefact `.appbar.home` ; `AppBar kind="tab"` du
// système de design) : le logotype toujours à gauche, la pastille de la casquette quand ce n'est pas la casquette de
// base (logo de la structure pour l'organisateur), puis Recherche et Boîte à droite. L'avatar a quitté la barre : il
// est dans Mon profil. Appui long sur le logotype : retour à la casquette de base (exposant ou visiteur) ; appui sur la
// pastille : Mon profil de la casquette de base. La Boîte réunit messages, demandes et notifications : sa pastille compte
// les deux ; pour l'organisateur, les non-lus de la Boîte de la structure.
// Lot C1 (artefact DA v2, `.capchip`) : la pastille « Organisateur » (logo de la structure) seulement pour
// l'organisateur (et l'Administration, sans onglet Profil : la pastille est son seul retour).
// Lot M7 (deux modes d'affichage) : le layout d'un groupe d'onglets (`PersonaTabs`) pose la bande une fois
// (`TabBandProvider`) : une seule lecture des compteurs et de la casquette pour tous les onglets, donc une bande
// identique d'un onglet à l'autre, qui ne saute pas au glissement. Chaque page d'onglet l'affiche à la même place, hors
// de la zone qui glisse (`TabScreen`, `TabStage`), sous ses feuilles (règle du socle C1 : une feuille couvre les deux
// bandes). Hors d'un groupe d'onglets, pas de bande : l'écran est en mode B (en-tête de fiche, `FicheHeader`).
import { AppBar, type AppBarProps } from "@orasso/design-system/native";
import { useRouter } from "expo-router";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/lib/api";
import { usePersona } from "@/lib/persona";
import { homeOf, personaKindLabels, tabHref } from "@/lib/personaModel";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";

type Band = Pick<
  AppBarProps,
  "persona" | "onPersona" | "onLogo" | "onLogoLongPress" | "logoHint" | "onSearch" | "onInbox" | "inboxCount"
>;

const TabBandContext = createContext<Band | null>(null);

/** La bande du groupe d'onglets : lue une fois par le layout, affichée par chaque page d'onglet. */
export function TabBandProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { me } = useSession();
  const { persona, base, active, choose, backToBase } = usePersona();
  // Organisateur (artefact) et Administration (hors artefact, sans onglet Profil : la pastille est son seul retour).
  const showPersona = persona.kind === "organizer" || persona.kind === "admin";
  // Organisateur : la Boîte de la structure (messages de participants, discussions du staff, demandes non traités).
  const structureId = persona.kind === "organizer" ? persona.structureId : null;
  const orgInbox = useApi(() => api.orgInboxSummary(structureId ?? ""), [structureId], {
    enabled: structureId !== null && !active.assisted,
    refreshMs: 60_000,
  });
  const orgCount = orgInbox.data
    ? orgInbox.data.participantMessages + orgInbox.data.staffDiscussions + orgInbox.data.staffRequests
    : 0;
  const inboxCount = structureId ? orgCount : (me?.unreadInbox ?? 0) + (me?.counts.unreadNotifications ?? 0);
  const baseLabel = personaKindLabels[base.kind];

  const band = useMemo<Band>(
    () => ({
      persona: showPersona
        ? {
            logoUrl: active.logoUrl,
            label: active.label,
            role: personaKindLabels[persona.kind],
            hint: "Ouvre Mon profil",
          }
        : undefined,
      onPersona: () => choose(base, tabHref(base.kind, "profil") ?? undefined),
      onLogo: () => router.navigate(homeOf(persona) as never),
      onLogoLongPress: persona.kind === base.kind ? undefined : backToBase,
      logoHint: `Appui long : revenir au profil ${baseLabel.toLowerCase()}`,
      onSearch: () => router.push("/recherche"),
      onInbox: () => router.push(persona.kind === "organizer" ? "/boite/orga" : "/boite"),
      inboxCount,
    }),
    [showPersona, active.logoUrl, active.label, persona, base, baseLabel, choose, backToBase, router, inboxCount],
  );

  return <TabBandContext.Provider value={band}>{children}</TabBandContext.Provider>;
}

/** L'écran est-il une page d'un groupe d'onglets (mode A) ? */
export function useInTabs(): boolean {
  return useContext(TabBandContext) !== null;
}

/** La bande ORASSO, telle que le groupe d'onglets l'a posée ; rien hors d'un groupe d'onglets. */
export function TopBar() {
  const band = useContext(TabBandContext);
  const insets = useSafeAreaInsets();
  if (!band) return null;
  return <AppBar kind="tab" safeTop={insets.top} {...band} />;
}
