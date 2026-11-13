// Profil d'un autre (lot 17, ARCHITECTURE-SUITE § 2.2 et 2.5) : complet pour un compte public ou un abonné accepté, réduit
// (pseudo, photo, grade, marque et modèle) pour un compte privé. Jamais la plaque. Réservé aux connectés.
// Lot R5b (maquette R5.6, retour 6 de Damien) : le même écran que l'aperçu (`PublicProfile`) ; « Écrire » et « ⋯ »
// (signaler) passent dans l'en-tête, à gauche du ✕.
// Lot R7b1 (maquette R7.12) : « Message » quitte l'en-tête pour le corps du profil, à côté de « Suivre » (`PublicProfile`) ;
// il ne reste que « ⋯ » (signaler).
// Lot R8b1 (D40, maquette R8.1) : « ⋯ » quitte l'en-tête à son tour : l'icône « Plus » du haut du profil (`PublicProfile`) ouvre la
// feuille qui porte « Signaler ».
import { Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { publicProfileLabels } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet } from "react-native";

import { PublicProfile } from "@/features/profil/PublicProfile";
import { api } from "@/lib/api";
import { useActor } from "@/lib/useActor";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen, SectionTitle } from "@/ui/Screens";

const { space1, space3 } = tokens.spacing;

export default function UserProfile() {
  const { t } = useTheme();
  const router = useRouter();
  const { pseudo } = useLocalSearchParams<{ pseudo: string }>();
  const actor = useActor();
  const profile = useApi(() => api.userProfile(pseudo, actor), [pseudo, actor]);
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
    <FlowScreen title={p.pseudo} facts={publicProfileLabels.profile} onClose={close} onRefresh={profile.reload}>
      <PublicProfile p={p} mode={isSelf ? "self" : "live"} onChanged={() => void profile.reload()} />

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
