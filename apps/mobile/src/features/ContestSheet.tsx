// Contester un malus (7 jours après son application) : un message à l'organisateur, qui tranche avant l'administration.
import { Button, Text, TextField, useTheme } from "@orasso/design-system/native";
import { useState } from "react";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { AppSheet } from "@/ui/AppSheet";

export function ContestSheet({
  target,
  onClose,
  onDone,
}: {
  target: { applicationId: string; title: string } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTheme();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <AppSheet visible={Boolean(target)} onClose={onClose} accessibilityLabel="Contester un malus">
      {target ? (
        <>
          <Text variant="title" color={t.color.ink}>
            Contester le malus
          </Text>
          <Text variant="body" color={t.color.inkMuted}>
            {target.title} · explique à l'équipe organisatrice pourquoi ce malus est une erreur (présent sans scan,
            empêchement signalé…). Il répond sous 7 jours, puis l'équipe Orasso tranche.
          </Text>
          <TextField
            label="Ton message"
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={1000}
            style={{ minHeight: 96 }}
          />
          {error ? (
            <Text variant="caption" color={t.color.winText} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button
            variant="primary"
            icon="check"
            loading={busy}
            disabled={message.trim().length === 0}
            fullWidth
            onPress={async () => {
              setBusy(true);
              setError(null);
              try {
                await api.contestMalus(target.applicationId, message.trim());
                setMessage("");
                onDone();
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Envoyer ma contestation
          </Button>
        </>
      ) : null}
    </AppSheet>
  );
}
