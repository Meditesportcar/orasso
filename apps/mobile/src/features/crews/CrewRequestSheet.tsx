// Lot R5c2 (maquette R5.8, retour 8 de Damien) : « Demander à rejoindre » ouvre toujours la même feuille, d'où qu'on
// vienne (vitrine du crew, « Rejoindre un crew », Explorer) : un mot pour le chef (300 caractères, facultatif), une
// phrase d'exemple en indication, puis « Envoyer la demande ». Rien ne part sans passer par cette feuille.
import { Text, TextField, useTheme } from "@orasso/design-system/native";
import { CREW_REQUEST_MESSAGE_MAX, type CrewView, crewPageLabels as L } from "@orasso/shared";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { AppSheet } from "@/ui/AppSheet";
import { SmButton } from "@/ui/Kit";
import { Notice } from "@/ui/Notice";

export type CrewRequestTarget = { id: string; name: string; leaderPseudo: string | null };

export function CrewRequestSheet({
  crew,
  onClose,
  onSent,
}: {
  /** Le crew visé ; `null` : feuille fermée. */
  crew: CrewRequestTarget | null;
  onClose: () => void;
  onSent: (view: CrewView) => void;
}) {
  const { t } = useTheme();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Une nouvelle ouverture repart d'un message vide (jamais le mot écrit pour un autre crew).
  useEffect(() => {
    if (!crew) return;
    setMessage("");
    setError(null);
  }, [crew]);

  async function send() {
    if (!crew) return;
    setBusy(true);
    setError(null);
    try {
      const view = await api.requestCrew(crew.id, message.trim() || null);
      onSent(view);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppSheet visible={crew !== null} onClose={onClose} accessibilityLabel={crew ? L.sheetTitle(crew.name) : ""}>
      {crew ? (
        <>
          <Text variant="posterM" color={t.color.ink} accessibilityRole="header">
            {L.sheetTitle(crew.name)}
          </Text>
          <TextField
            label={L.sheetLabel(crew.leaderPseudo)}
            value={message}
            onChangeText={setMessage}
            maxLength={CREW_REQUEST_MESSAGE_MAX}
            placeholder={L.sheetPlaceholder}
            multiline
            testID="crew-request-message"
          />
          <Text variant="caption" color={t.color.inkMuted}>
            {L.sheetHint}
          </Text>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <SmButton
            kind="p"
            big
            wide
            icon="send"
            disabled={busy}
            onPress={() => void send()}
            testID="crew-request-send"
          >
            {L.sheetSend}
          </SmButton>
        </>
      ) : null}
    </AppSheet>
  );
}
