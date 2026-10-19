// Créer mon profil de prestataire (lot 21), depuis « Mes casquettes » : le formulaire du profil, puis la casquette
// Prestataire s'ouvre sur l'onglet Profil pour ajouter des photos. Un pro peut créer le stand de sa fiche pro en un geste.
import { Button, Text, tokens, useTheme } from "@orasso/design-system/native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet } from "react-native";

import { ProviderForm } from "@/features/provider/ProviderForm";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { usePersona } from "@/lib/persona";
import { useSession } from "@/lib/session";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";

const { space3 } = tokens.spacing;

export default function NouveauPrestataire() {
  const { t } = useTheme();
  const router = useRouter();
  const { me, refreshMe } = useSession();
  const { choose } = usePersona();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPro = me?.personas?.some((p) => p.kind === "pro") ?? false;

  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

  /** Le profil existe : les casquettes sont relues, puis la casquette Prestataire s'ouvre (Candidatures, qui dit quoi compléter). */
  async function done() {
    await refreshMe();
    choose({ kind: "provider" });
  }

  async function fromPro() {
    setBusy(true);
    setError(null);
    try {
      await api.providerFromPro();
      await done();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FlowScreen title="Profil prestataire" onClose={close}>
      <Text variant="body" color={t.color.inkMuted}>
        Food truck, barbier, tatoueur, photographe, animation… Ni SIRET ni fiche pro : un amateur sans structure peut
        candidater. Tu ajouteras tes photos juste après.
      </Text>
      <ProviderForm profile={null} submitLabel="Créer mon profil" onSaved={() => void done()} />
      {isPro ? (
        <>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button
            variant="secondary"
            icon="add"
            loading={busy}
            disabled={busy}
            onPress={() => void fromPro()}
            fullWidth
            style={styles.stand}
          >
            Créer le stand de ma fiche pro
          </Button>
        </>
      ) : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  stand: { marginTop: space3 },
});
