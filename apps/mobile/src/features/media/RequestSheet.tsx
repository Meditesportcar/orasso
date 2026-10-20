// Demande d'accréditation (lot 55, prototype `s-agenda`, « Demander ») : ce que le média produit, un mot pour
// l'organisation, le règlement de l'événement à accepter, « Envoyer la demande » puis le O qui s'allume (SendBurst).
// Les règles (profil complet, accréditation ouverte, date limite, quota, événement sur invitation) sont celles de l'API :
// son message s'affiche tel quel, et « sur invitation » est remonté à l'écran (pastille « Invitation »).
import {
  Button,
  CheckboxField,
  Chip,
  ChipRow,
  Plate,
  SendBurst,
  Text,
  TextField,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import { mediaAppLabels as L, type MediaFormat, mediaFormatLabels, mediaFormats } from "@orasso/shared";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { ApiRequestError, errorMessage } from "@/lib/http";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "@/ui/AppSheet";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";

const { space2, space3 } = tokens.spacing;

export type RequestTarget = { id: string; slug: string; title: string };

export function RequestSheet({
  target,
  defaultFormats,
  onClose,
  onSent,
  onInvitation,
}: {
  /** L'événement visé ; `null` = feuille fermée. */
  target: RequestTarget | null;
  /** Les formats du profil du média, proposés d'office. */
  defaultFormats: readonly MediaFormat[];
  onClose: () => void;
  /** La demande est partie : l'écran relit ses listes. */
  onSent: () => void;
  onInvitation?: (eventId: string) => void;
}) {
  const { t } = useTheme();
  const [formats, setFormats] = useState<MediaFormat[]>([...defaultFormats]);
  const [message, setMessage] = useState("");
  const [rules, setRules] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  // Le règlement s'ouvre dans la feuille : lu à la demande, seulement quand elle est ouverte.
  const event = useApi(() => api.eventBySlug(target?.slug ?? ""), [target?.slug], { enabled: target !== null });

  const defaults = defaultFormats.join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: remis à zéro à chaque ouverture, pour un événement donné
  useEffect(() => {
    if (target === null) return;
    setFormats(defaults ? (defaults.split(",") as MediaFormat[]) : []);
    setMessage("");
    setRules(false);
    setError(null);
    setSent(false);
  }, [target?.id, defaults]);

  const toggle = (f: MediaFormat) => setFormats((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));

  async function send() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      await api.requestAccreditation(target.id, { formats, message: message.trim() || null });
      setSent(true);
      onSent();
    } catch (e) {
      if (e instanceof ApiRequestError && e.code === "invite_only") {
        onInvitation?.(target.id);
        onClose();
      } else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppSheet visible={target !== null} onClose={onClose} accessibilityLabel={L.requestTitle}>
      {sent ? (
        <View style={styles.sent} testID="media-request-sent">
          <SendBurst size={90} />
          <Text variant="title" color={t.color.ink}>
            {L.requestSent}
          </Text>
          <Muted variant="body">{L.requestSentText}</Muted>
          <Button variant="secondary" icon="check" onPress={onClose} fullWidth>
            Fermer
          </Button>
        </View>
      ) : (
        <>
          <Text variant="title" color={t.color.ink}>
            {L.requestTitle}
          </Text>
          {target ? <Muted variant="body">{L.requestFor(target.title)}</Muted> : null}
          <Muted variant="label">{L.requestFormats}</Muted>
          <ChipRow>
            {mediaFormats.map((f) => (
              <Chip key={f} selected={formats.includes(f)} onPress={() => toggle(f)}>
                {mediaFormatLabels[f]}
              </Chip>
            ))}
          </ChipRow>
          <TextField
            label={L.requestMessage}
            help={L.requestMessageHelp}
            value={message}
            onChangeText={setMessage}
            maxLength={500}
            multiline
            tall
          />
          <Muted variant="label">{L.requestRules}</Muted>
          <Plate style={styles.rules} testID="media-request-rules">
            <Text variant="body" color={t.color.plateInk}>
              {event.data ? event.data.rulesText?.trim() || L.requestNoRules : "…"}
            </Text>
          </Plate>
          <CheckboxField label={L.requestRulesNote} checked={rules} onChange={setRules} />
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button
            variant="primary"
            icon="send"
            loading={busy}
            disabled={!rules || formats.length === 0 || busy}
            onPress={() => void send()}
            fullWidth
            testID="media-request-send"
          >
            {L.requestSend}
          </Button>
        </>
      )}
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  rules: { padding: space3 },
  sent: { alignItems: "center", gap: space2 },
});
