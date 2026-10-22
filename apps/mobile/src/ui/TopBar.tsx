// Barre du haut v2 de tous les onglets (DA v2, lot 40, prototype `s-plan` ; `AppBar kind="tab"` du système de design) :
// le logotype toujours à gauche, la pastille de la casquette quand ce n'est pas la casquette de base (logo de la
// structure pour l'organisateur), puis Recherche et Boîte à droite. L'avatar a quitté la barre : il est dans Mon profil.
// Appui long sur le logotype : retour à la casquette de base (exposant ou visiteur) ; appui sur la pastille : Mon profil
// de la casquette de base (prototype : la pastille de l'organisateur ramène au profil). La Boîte réunit messages,
// demandes et notifications (elle remplace la cloche) : sa pastille compte les deux ; pour l'organisateur, les non-lus
// de la Boîte de la structure.
// Lot C1 (artefact DA v2, `.capchip`) : la pastille « Organisateur » (logo de la structure) seulement pour
// l'organisateur ; les autres casquettes reviennent à leur base par Mon profil. Le logotype et la pastille sont
// pressables dans l'`AppBar` du système de design.
import { AppBar } from "@orasso/design-system/native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/lib/api";
import { usePersona } from "@/lib/persona";
import { homeOf, personaKindLabels, tabHref } from "@/lib/personaModel";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";

export function TopBar({ inboxOn = false, onClose }: { inboxOn?: boolean; onClose?: () => void }) {
  const insets = useSafeAreaInsets();
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

  return (
    <AppBar
      kind="tab"
      safeTop={insets.top}
      persona={
        showPersona
          ? {
              logoUrl: active.logoUrl,
              label: active.label,
              role: personaKindLabels[persona.kind],
              hint: "Ouvre Mon profil",
            }
          : undefined
      }
      onPersona={() => choose(base, tabHref(base.kind, "profil") ?? undefined)}
      onLogo={() => router.navigate(homeOf(persona) as never)}
      onLogoLongPress={persona.kind === base.kind ? undefined : backToBase}
      logoHint={`Appui long : revenir au profil ${baseLabel.toLowerCase()}`}
      onSearch={() => router.push("/recherche")}
      onInbox={() => router.push(persona.kind === "organizer" ? "/boite/orga" : "/boite")}
      inboxOn={inboxOn}
      inboxCount={inboxCount}
      onClose={onClose}
    />
  );
}
