// Feuille « Demande de contact » (lot 18, docs/01) : pas amis → le message part en demande, rangée à part chez
// l'autre ; texte obligatoire ; une seule demande possible.
import { Button, Text, TextField, useTheme } from "@orasso/design-system/native";
import { CONTACT_MESSAGE_MAX, messagingLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";

import { api } from "@/lib/api";
import { ApiRequestError, errorMessage } from "@/lib/http";
import { AppSheet } from "@/ui/AppSheet";

export function ContactRequestSheet({ pseudo, onClose }: { pseudo: string | null; onClose: () => void }) {
  const { t } = useTheme();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const close = () => {
    setMessage("");
    setError(null);
    setSent(null);
    onClose();
  };

  return (
    <AppSheet visible={pseudo !== null} onClose={close} accessibilityLabel={messagingLabels.contactRequest}>
      <Text variant="title" color={t.color.ink}>
        {messagingLabels.contactRequest}
      </Text>
      {sent ? (
        <Text variant="body" color={t.color.ink} testID="contact-sent">
          {messagingLabels.contactRequestSent(sent)}
        </Text>
      ) : (
        <>
          <Text variant="body" color={t.color.inkMuted}>
            {messagingLabels.contactRequestHint}
          </Text>
          <TextField
            label="Message"
            placeholder={messagingLabels.contactRequestPlaceholder}
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={CONTACT_MESSAGE_MAX}
            style={{ minHeight: 96 }}
          />
          {error ? (
            <Text variant="caption" color={t.color.winText} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button
            variant="primary"
            icon="chat"
            loading={busy}
            disabled={message.trim().length === 0}
            fullWidth
            onPress={async () => {
              if (!pseudo) return;
              setBusy(true);
              setError(null);
              try {
                const result = await api.requestContact(pseudo, message.trim());
                setSent(result.pseudo);
              } catch (e) {
                const conversationId = (e as ApiRequestError).details?.conversationId;
                if (e instanceof ApiRequestError && e.code === "use_direct" && typeof conversationId === "string") {
                  close();
                  router.push(`/boite/${conversationId}`);
                  return;
                }
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {messagingLabels.contactRequestSend}
          </Button>
        </>
      )}
    </AppSheet>
  );
}
