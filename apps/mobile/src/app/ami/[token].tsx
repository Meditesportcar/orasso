// Lien de profil `orasso://ami/<jeton>` (lot 17, ARCHITECTURE-SUITE § 1.3 ; lot R6b : on suit la personne, ou on lui
// demande si son compte est privé). Le chemin garde son nom (les liens déjà partagés continuent de marcher).
// Déconnecté, on propose de se connecter (le lien se rouvre ensuite).
import { Button, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type FollowState, networkLabels as N, socialLabels } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useSession } from "@/lib/session";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";

const { space3 } = tokens.spacing;

export default function AmiLink() {
  const { t } = useTheme();
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { status } = useSession();
  const [result, setResult] = useState<{ mine: FollowState; pseudo: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.followByInvite(token));
    } catch (e) {
      const message = errorMessage(e);
      setError(message === socialLabels.selfRequest ? N.ownInviteLink : message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <FlowScreen title="Lien de profil" onClose={() => router.replace(status === "in" ? "/" : "/auth")}>
      <View style={styles.col}>
        {status !== "in" ? (
          <>
            <Text variant="body" color={t.color.ink}>
              Connecte-toi pour suivre cette personne, puis rouvre ce lien.
            </Text>
            <Button variant="primary" icon="entry" onPress={() => router.replace("/auth")} fullWidth>
              Se connecter
            </Button>
          </>
        ) : result ? (
          <>
            <Notice>{result.mine === "accepted" ? N.followedNow(result.pseudo) : N.requestedNow(result.pseudo)}</Notice>
            <Button
              variant="secondary"
              icon="profile"
              onPress={() => router.replace(`/u/${encodeURIComponent(result.pseudo)}`)}
              fullWidth
            >
              Voir le profil
            </Button>
          </>
        ) : (
          <>
            <Muted variant="body">Quelqu'un te propose son profil Orasso. Tu peux le suivre.</Muted>
            {error ? <Notice tone="error">{error}</Notice> : null}
            <Button variant="primary" icon="add" loading={busy} onPress={() => void send()} fullWidth>
              {N.follow}
            </Button>
          </>
        )}
      </View>
    </FlowScreen>
  );
}

const styles = StyleSheet.create({ col: { gap: space3 } });
