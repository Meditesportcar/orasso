// Réglages › Confidentialité (lot R5c1, tour 2) : « Retirer mes publications des crews que j'ai quittés », en bloc, avec
// une confirmation dans l'écran (pas de boîte de dialogue). Publications (photos comprises) et commentaires.
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { crewFeedLabels } from "@orasso/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { SmButton } from "@/features/passionne/kit";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";

export function LeftCrewsSection() {
  const { t } = useTheme();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function withdraw() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.withdrawFromLeftCrews();
      setDone(crewFeedLabels.leftCrewsDone(r.posts, r.comments));
      setAsking(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.block} testID="left-crews">
      <Text variant="bodyStrong" color={t.color.ink}>
        {crewFeedLabels.leftCrewsTitle}
      </Text>
      <Muted variant="caption">{crewFeedLabels.leftCrewsHint}</Muted>
      {asking ? (
        <View style={[styles.confirm, { backgroundColor: t.color.surfaceSunken }]} testID="left-crews-confirm">
          <Text variant="body" color={t.color.ink}>
            {crewFeedLabels.leftCrewsConfirm}
          </Text>
          <View style={styles.row}>
            <SmButton kind="s" icon="trash" disabled={busy} onPress={() => void withdraw()} testID="left-crews-yes">
              {crewFeedLabels.leftCrewsConfirmAction}
            </SmButton>
            <SmButton kind="g" icon="close" disabled={busy} onPress={() => setAsking(false)}>
              {crewFeedLabels.cancel}
            </SmButton>
          </View>
        </View>
      ) : (
        <SmButton
          kind="s"
          icon="trash"
          wide
          onPress={() => {
            setDone(null);
            setAsking(true);
          }}
          testID="left-crews-open"
        >
          {crewFeedLabels.leftCrewsAction}
        </SmButton>
      )}
      {done ? <Notice>{done}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: tokens.spacing.space2 },
  confirm: { gap: tokens.spacing.space2, padding: tokens.spacing.space3, borderRadius: tokens.radius.radiusMd },
  row: { flexDirection: "row", flexWrap: "wrap", gap: tokens.spacing.space2 },
});
