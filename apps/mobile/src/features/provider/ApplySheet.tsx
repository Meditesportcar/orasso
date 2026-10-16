// Candidature d'un prestataire (lot 21) : un mot pour l'organisateur, le règlement accepté. L'organisateur trie ensuite
// dans l'onglet « Prestataires » ; la candidature ne compte pas dans les places.
import { Button, CheckboxField, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { useEffect, useState } from "react";
import { StyleSheet } from "react-native";

import { errorMessage } from "@/lib/http";
import { AppSheet } from "@/ui/AppSheet";
import { Notice } from "@/ui/Notice";

const { space2 } = tokens.spacing;

export function ApplySheet({
  eventTitle,
  onClose,
  onSend,
}: {
  /** Titre de l'événement visé ; `null` = feuille fermée. */
  eventTitle: string | null;
  onClose: () => void;
  onSend: (message: string | null) => Promise<void>;
}) {
  const { t } = useTheme();
  const [message, setMessage] = useState("");
  const [rules, setRules] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (eventTitle === null) return;
    setMessage("");
    setRules(false);
    setError(null);
  }, [eventTitle]);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await onSend(message.trim() || null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppSheet visible={eventTitle !== null} onClose={onClose} accessibilityLabel="Candidater comme prestataire">
      <Text variant="title" color={t.color.ink}>
        Candidater
      </Text>
      <Text variant="body" color={t.color.inkMuted}>
        {eventTitle}
      </Text>
      <TextField
        label="Un mot pour l'organisateur (facultatif)"
        value={message}
        onChangeText={setMessage}
        maxLength={300}
        multiline
        tall
      />
      <CheckboxField label="J'accepte le règlement de l'événement" checked={rules} onChange={setRules} />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button
        variant="primary"
        icon="check"
        loading={busy}
        disabled={!rules || busy}
        onPress={() => void send()}
        fullWidth
        style={styles.send}
      >
        Envoyer ma candidature
      </Button>
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  send: { marginTop: space2 },
});
