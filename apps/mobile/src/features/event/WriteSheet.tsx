// « Écrire à <organisateur> » depuis la fiche (lot M4, maquette 4.2, retour 21) : le ✉ de la bande de l'organisateur.
// L'étiquette « À propos de : <événement · date> » est en tête ; le message part avec `aboutEventId`, l'API la garde sur
// le message et la montre des deux côtés. Après l'envoi : « Ouvrir la conversation ».
import { Text, TextField, useTheme } from "@orasso/design-system/native";
import { type EventPublic, messagingLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { AboutCard } from "@/features/boite/AboutCard";
import { SmButton } from "@/features/passionne/kit";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { AppSheet } from "@/ui/AppSheet";

function clientId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function WriteSheet({
  event: e,
  visible,
  onClose,
}: {
  event: EventPublic;
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTheme();
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  useEffect(() => {
    if (!visible) return;
    setBody("");
    setError(null);
    setSent(null);
  }, [visible]);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const { id } = await api.contactStructure(e.structure.id);
      await api.sendMessage(id, { clientId: clientId(), body: body.trim(), aboutEventId: e.id });
      setSent(id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel={messagingLabels.writeTo(e.structure.name)}>
      <View style={styles.stack} testID="write-sheet">
        <Text variant="posterM" color={t.color.ink} style={styles.title}>
          {messagingLabels.writeTo(e.structure.name)}
        </Text>
        <AboutCard
          about={{ eventId: e.id, slug: e.slug, title: e.title, startsAt: e.startsAt, city: e.city }}
          link={false}
        />
        <Text variant="caption" color={t.color.inkMuted}>
          {messagingLabels.aboutEventHint}
        </Text>
        {sent ? (
          <>
            <Text variant="bodyStrong" color={t.color.ink} testID="write-sent">
              {messagingLabels.sent}
            </Text>
            <SmButton
              kind="s"
              big
              wide
              icon="chat"
              onPress={() => {
                onClose();
                router.push(`/boite/${sent}`);
              }}
              testID="write-open"
            >
              {messagingLabels.openConversation}
            </SmButton>
          </>
        ) : (
          <>
            <TextField
              label={messagingLabels.yourMessage}
              value={body}
              onChangeText={setBody}
              multiline
              maxLength={2000}
              testID="write-body"
            />
            {error ? (
              <Text variant="caption" color={t.color.winText} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
            <SmButton
              kind="p"
              big
              wide
              icon="send"
              disabled={busy || body.trim().length === 0}
              onPress={() => void send()}
              testID="write-send"
            >
              Envoyer
            </SmButton>
          </>
        )}
      </View>
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  title: { fontSize: 18, lineHeight: 19 },
});
