// Proposer sa vitrine à une mission (DA v2, lot 54, prototype `s-missions`) : la feuille dit le besoin visé, laisse un mot
// pour l'équipe organisatrice, demande le règlement, et « Envoyer » lance l'envoi : un tour de drift, la voiture se gare,
// le O s'allume (`SendBurst`), puis « Candidature envoyée ». La candidature ne compte jamais dans les places.
import {
  Button,
  CheckboxField,
  Chip,
  SendBurst,
  Text,
  TextField,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import { type MissionCard, missionTexts, proV2Labels } from "@orasso/shared";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { errorMessage } from "@/lib/http";
import { AppSheet } from "@/ui/AppSheet";
import { Notice } from "@/ui/Notice";

const { space2, space3 } = tokens.spacing;

export function ProposeSheet({
  mission,
  providerName,
  onClose,
  onSend,
}: {
  /** La mission visée ; `null` = feuille fermée. */
  mission: MissionCard | null;
  providerName: string;
  onClose: () => void;
  onSend: (input: { needId: string; message: string | null }) => Promise<void>;
}) {
  const { t } = useTheme();
  const [needId, setNeedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [rules, setRules] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missionId = mission?.id ?? null;
  const firstNeed = mission?.needs[0]?.id ?? null;
  useEffect(() => {
    if (missionId === null) return;
    setNeedId(firstNeed);
    setMessage("");
    setRules(false);
    setSent(false);
    setError(null);
  }, [missionId, firstNeed]);

  async function send() {
    if (!needId) return;
    setBusy(true);
    setError(null);
    try {
      await onSend({ needId, message: message.trim() || null });
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppSheet visible={mission !== null} onClose={onClose} accessibilityLabel={proV2Labels.proposeTitle(providerName)}>
      <Text variant="title" color={t.color.ink}>
        {sent ? proV2Labels.proposeSent : proV2Labels.proposeTitle(providerName)}
      </Text>
      <Text variant="body" color={t.color.inkMuted}>
        {mission?.title}
        {mission ? ` · ${mission.structureName}` : ""}
      </Text>
      {sent ? (
        <View style={styles.sent} testID="propose-sent">
          <SendBurst size={96} />
          <Text variant="body" color={t.color.ink} style={styles.center}>
            {proV2Labels.proposeSentText(providerName)}
          </Text>
          <Button variant="plate" icon="check" onPress={onClose} fullWidth testID="propose-close">
            Fermer
          </Button>
        </View>
      ) : (
        <>
          {mission && mission.needs.length > 1 ? (
            <View style={styles.needs}>
              <Text variant="label" color={t.color.inkMuted}>
                {proV2Labels.proposeNeed}
              </Text>
              <View style={styles.row}>
                {mission.needs.map((n) => (
                  <Chip key={n.id} selected={needId === n.id} onPress={() => setNeedId(n.id)}>
                    {`${n.tradeLabel} · ${missionTexts.places(n.remaining, n.quantity, n.tradeLabel)}`}
                  </Chip>
                ))}
              </View>
            </View>
          ) : null}
          <TextField
            label={proV2Labels.proposeMessage}
            value={message}
            onChangeText={setMessage}
            maxLength={300}
            multiline
            tall
          />
          <CheckboxField label={proV2Labels.proposeRules} checked={rules} onChange={setRules} />
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button
            variant="primary"
            icon="send"
            loading={busy}
            disabled={!rules || busy || !needId}
            onPress={() => void send()}
            fullWidth
            style={styles.send}
            testID="propose-send"
          >
            {proV2Labels.proposeSend}
          </Button>
        </>
      )}
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  send: { marginTop: space2 },
  sent: { alignItems: "center", gap: space3 },
  center: { textAlign: "center" },
  needs: { gap: space2 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
});
