// Modifier mon profil média (lot 55), depuis la ligne de la casquette dans Mon profil : nom, formats, liens, logo, zone
// couverte. Enregistrer ramène d'où l'on vient ; la vérification du profil par l'administration reste en place.
import { Chip } from "@orasso/design-system/native";
import { mediaAppLabels as L } from "@orasso/shared";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";

import { MediaProfileForm } from "@/features/media/MediaProfileForm";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";

export default function ModifierMedia() {
  const router = useRouter();
  const { refreshMe } = useSession();
  const profile = useApi(async () => (await api.myMediaProfile()).profile, []);
  const [saved, setSaved] = useState(false);
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));
  // Pas encore de profil : on le crée.
  if (profile.data === null && !profile.loading && !profile.error) return <Redirect href="/media/nouveau" />;
  return (
    <FlowScreen title={L.profileTitle} onClose={close}>
      {profile.error ? <Notice tone="error">{profile.error.message}</Notice> : null}
      {profile.data ? (
        <>
          <Chip variant={profile.data.verifiedAt ? "verified" : "default"}>
            {profile.data.verifiedAt ? L.profileVerified : L.profileToVerify}
          </Chip>
          {profile.data.issue ? <Notice testID="media-issue">{profile.data.issue}</Notice> : null}
          {saved ? <Notice testID="media-saved">{L.profileSaved}</Notice> : null}
          <MediaProfileForm
            key={profile.data.id}
            profile={profile.data}
            submitLabel={L.profileSave}
            onSaved={async (next) => {
              profile.setData(next);
              setSaved(true);
              await refreshMe();
            }}
          />
        </>
      ) : (
        <Muted variant="body">Chargement…</Muted>
      )}
    </FlowScreen>
  );
}
