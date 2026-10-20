// Créer mon profil média (lot 55), depuis « Créer » dans Mon profil ou la carte « Termine ta fiche » de l'arrivée : le
// formulaire du profil, puis la casquette Média s'ouvre sur son Accueil. Un compte n'a qu'un profil média.
import { mediaAppLabels as L } from "@orasso/shared";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";

import { MediaProfileForm } from "@/features/media/MediaProfileForm";
import { usePersona } from "@/lib/persona";
import { useSession } from "@/lib/session";
import { Muted } from "@/ui/Muted";
import { FlowScreen } from "@/ui/Screens";

export default function NouveauMedia() {
  const router = useRouter();
  const { me, refreshMe } = useSession();
  const { choose } = usePersona();
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));
  // Déjà un profil à l'ouverture : on le modifie plutôt que d'en créer un second. (Relevé une seule fois : la casquette
  // créée à l'instant ne doit pas ramener ici sur « modifier » avant l'ouverture de la barre du média.)
  const [existing] = useState(() => me?.personas?.some((p) => p.kind === "media") ?? false);
  if (existing) return <Redirect href="/media/modifier" />;
  return (
    <FlowScreen title={L.profileTitle} onClose={close}>
      <Muted variant="body">{L.profileCreateIntro}</Muted>
      <MediaProfileForm
        profile={null}
        submitLabel={L.profileCreate}
        onSaved={async (saved) => {
          await refreshMe();
          choose({ kind: "media", mediaProfileId: saved.id }, "/(media)/accueil");
        }}
      />
    </FlowScreen>
  );
}
