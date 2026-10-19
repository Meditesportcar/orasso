// Lien d'ami `orasso://ami/<jeton>` (lot 17, ARCHITECTURE-SUITE § 1.3) : connecté, la demande d'ami part vers le
// propriétaire du lien ; déconnecté, on propose de se connecter (le lien se rouvre ensuite).
import { Button, Text, tokens, useTheme } from "@orasso/design-system/native";
import { socialLabels } from "@orasso/shared";
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
  const [result, setResult] = useState<{ status: "pending" | "accepted"; pseudo: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.requestFriendByInvite(token));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FlowScreen title="Lien d'ami" onClose={() => router.replace(status === "in" ? "/" : "/auth")}>
      <View style={styles.col}>
        {status !== "in" ? (
          <>
            <Text variant="body" color={t.color.ink}>
              Connecte-toi pour envoyer ta demande d'ami, puis rouvre ce lien.
            </Text>
            <Button variant="primary" icon="entry" onPress={() => router.replace("/auth")} fullWidth>
              Se connecter
            </Button>
          </>
        ) : result ? (
          <>
            <Notice>
              {result.status === "accepted"
                ? `Vous êtes amis avec ${result.pseudo}.`
                : socialLabels.requestSentTo(result.pseudo)}
            </Notice>
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
            <Muted variant="body">Quelqu'un t'invite à devenir ami sur Orasso.</Muted>
            {error ? <Notice tone="error">{error}</Notice> : null}
            <Button variant="primary" icon="add" loading={busy} onPress={() => void send()} fullWidth>
              {socialLabels.addFriend}
            </Button>
          </>
        )}
      </View>
    </FlowScreen>
  );
}

const styles = StyleSheet.create({ col: { gap: space3 } });
