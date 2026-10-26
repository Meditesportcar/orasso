// Profil d'un autre (lot 17, ARCHITECTURE-SUITE § 2.2 et 2.5) : complet pour un compte public ou un ami, réduit
// (pseudo, photo, grade, marque et modèle) pour un compte privé. Jamais la plaque. Réservé aux connectés.
// Lot R5b (maquette R5.6, retour 6 de Damien) : le même écran que l'aperçu (`PublicProfile`) ; « Écrire » et « ⋯ »
// (signaler) passent dans l'en-tête, à gauche du ✕.
import { AppBarFlowAction, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { publicProfileLabels } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet } from "react-native";

import { WriteHeaderAction } from "@/features/boite/MessageButton";
import { PublicProfile } from "@/features/profil/PublicProfile";
import { openReport } from "@/features/ReportSheet";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen, SectionTitle } from "@/ui/Screens";

const { space1, space3 } = tokens.spacing;

export default function UserProfile() {
  const { t } = useTheme();
  const router = useRouter();
  const { pseudo } = useLocalSearchParams<{ pseudo: string }>();
  const profile = useApi(() => api.userProfile(pseudo), [pseudo]);
  const [writeError, setWriteError] = useState<string | null>(null);
  const p = profile.data;

  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

  if (!p) {
    return (
      <FlowScreen title={pseudo ?? "Profil"} onClose={close}>
        {profile.error ? (
          <Notice tone="error">
            {profile.error.status === 404 ? "Ce profil n'existe pas ou plus." : profile.error.message}
          </Notice>
        ) : (
          <Muted variant="body">Chargement…</Muted>
        )}
      </FlowScreen>
    );
  }

  const isSelf = p.audience === "self";
  return (
    <FlowScreen
      title={p.pseudo}
      facts={publicProfileLabels.profile}
      onClose={close}
      onRefresh={profile.reload}
      actions={
        isSelf ? undefined : (
          <>
            {/* Messagerie (lot 18) : ami → conversation, sinon demande de contact. Signaler : lot 32. */}
            <WriteHeaderAction userId={p.userId} pseudo={p.pseudo} onError={setWriteError} />
            <AppBarFlowAction
              icon="more"
              label={publicProfileLabels.more}
              onPress={() => openReport({ type: "profile", id: p.userId })}
              testID="report-open-profile"
            />
          </>
        )
      }
    >
      <PublicProfile
        p={p}
        mode={isSelf ? "self" : "live"}
        onChanged={() => void profile.reload()}
        topNotice={writeError ? <Notice tone="error">{writeError}</Notice> : null}
      />

      {p.contact ? (
        <>
          <SectionTitle>Coordonnées</SectionTitle>
          <Plate style={styles.block} testID="profil-contact">
            <Text variant="body" color={t.color.plateMuted}>
              Visibles de toi parce qu'il ou elle est inscrit à tes événements.
            </Text>
            <Text variant="bodyStrong" color={t.color.plateInk}>
              {[p.contact.firstName, p.contact.lastName].filter(Boolean).join(" ") || "—"}
            </Text>
            <Text variant="body" color={t.color.plateInk}>
              {p.contact.phone ?? "—"}
            </Text>
            <Text variant="body" color={t.color.plateInk}>
              {p.contact.email ?? "—"}
            </Text>
          </Plate>
        </>
      ) : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space1, padding: space3 },
});
