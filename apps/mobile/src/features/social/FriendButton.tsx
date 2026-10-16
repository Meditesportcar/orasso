// Bouton d'ami selon la relation : Ajouter / Demande envoyée / Accepter + Refuser / Ami (retirer en deux appuis).
// Un seul bouton principal par écran : `primary` le réserve à l'action qui compte ici.
import { Button, tokens } from "@orasso/design-system/native";
import { type FriendshipState, friendStateLabels, socialLabels } from "@orasso/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { Notice } from "@/ui/Notice";

const { space2 } = tokens.spacing;

export function FriendButton({
  state,
  requestId,
  pseudo,
  userId,
  primary = false,
  source = "profile",
  onChanged,
}: {
  state: FriendshipState;
  requestId: string | null;
  pseudo: string;
  userId: string;
  primary?: boolean;
  source?: "profile" | "search";
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      setConfirming(false);
      onChanged();
    }
  }

  let buttons: React.ReactNode;
  if (state === "pending_out") {
    buttons = (
      <Button variant="secondary" icon="wait" disabled testID="friend-state">
        {friendStateLabels.pending_out}
      </Button>
    );
  } else if (state === "pending_in" && requestId) {
    buttons = (
      <View style={styles.row}>
        <Button
          variant={primary ? "primary" : "secondary"}
          icon="check"
          loading={busy}
          onPress={() => void run(() => api.acceptFriend(requestId))}
        >
          {socialLabels.accept}
        </Button>
        <Button
          variant="secondary"
          icon="close"
          loading={busy}
          onPress={() => void run(() => api.declineFriend(requestId))}
        >
          {socialLabels.decline}
        </Button>
      </View>
    );
  } else if (state === "friends") {
    buttons = confirming ? (
      <Button variant="alert" icon="close" loading={busy} onPress={() => void run(() => api.removeFriend(userId))}>
        {socialLabels.removeFriend}
      </Button>
    ) : (
      <Button variant="secondary" icon="check" onPress={() => setConfirming(true)} testID="friend-state">
        {friendStateLabels.friends}
      </Button>
    );
  } else {
    buttons = (
      <Button
        variant={primary ? "primary" : "secondary"}
        icon="add"
        loading={busy}
        onPress={() => void run(() => api.requestFriend(pseudo, source))}
        testID="friend-add"
      >
        {socialLabels.addFriend}
      </Button>
    );
  }
  return (
    <View style={styles.col}>
      {buttons}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  col: { gap: space2 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
});
