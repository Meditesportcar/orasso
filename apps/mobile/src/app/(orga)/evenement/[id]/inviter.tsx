// Casquette Organisateur, « Inviter » (lot 25, docs/02 : page événement côté organisateur > inviter) : par pseudo, les
// retenus de l'édition précédente, par e-mail, avec un message ; puis la liste des invitations et leur statut.
// Ouvert depuis le bouton « Inviter » de la page événement de la casquette (lot 22) : `/evenement/<id>/inviter`.
import { Button, Chip, Plate, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  INVITATION_MESSAGE_MAX,
  type InvitationCreateResult,
  invitationLabels,
  invitationSkipLabels,
  invitationStatusLabels,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { formatDay, formatDayHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen, SectionTitle } from "@/ui/Screens";

const L = invitationLabels;
const { space2, space3 } = tokens.spacing;

const splitList = (value: string) =>
  value
    .split(/[\s,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);

function resultText(r: InvitationCreateResult): string {
  const skipped = r.skipped.length
    ? ` · ${L.skipped(r.skipped.length)} : ${r.skipped.map((x) => `${x.target} (${invitationSkipLabels[x.reason]})`).join(", ")}`
    : "";
  return `${L.created(r.created)}${skipped}`;
}

export default function Inviter() {
  const { t } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const event = useApi(() => api.eventForInvitations(id), [id]);
  const sources = useApi(() => api.invitationSources(id), [id]);
  const sent = useApi(() => api.eventInvitations(id), [id]);
  const [pseudos, setPseudos] = useState("");
  const [emails, setEmails] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/evenements"));
  const e = event.data;
  const closed = Boolean(e && (e.isLocked || e.status !== "published"));

  async function run(key: string, action: () => Promise<InvitationCreateResult>) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const r = await action();
      setNotice(resultText(r));
      setPseudos("");
      setEmails("");
      await sent.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <FlowScreen
      title={L.inviteTitle}
      facts={e ? `${e.title} · ${formatDayHour(e.startsAt)}` : undefined}
      onClose={close}
      onRefresh={async () => {
        await Promise.all([event.reload(), sources.reload(), sent.reload()]);
      }}
    >
      {event.error ? <Notice tone="error">{event.error.message}</Notice> : null}
      {e ? (
        <Muted variant="caption">
          {e.admission === "invite_only" ? `${L.privateEvent}. ` : ""}
          {L.validUntil(formatDayHour(e.lockAt))}
        </Muted>
      ) : null}
      {notice ? <Notice>{notice}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      {closed ? (
        <Notice>
          {e?.status === "published"
            ? "Inscriptions verrouillées : les invitations ne sont plus possibles."
            : "Publie l'événement pour inviter."}
        </Notice>
      ) : (
        <>
          <TextField
            label={L.invitePseudo}
            help={L.invitePseudoHint}
            value={pseudos}
            onChangeText={setPseudos}
            autoCapitalize="none"
            autoCorrect={false}
            testID="invite-pseudos"
          />
          <TextField
            label={L.inviteEmail}
            help={L.inviteEmailHint}
            value={emails}
            onChangeText={setEmails}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
          />
          <TextField
            label={L.message}
            placeholder={L.messagePlaceholder}
            value={message}
            onChangeText={setMessage}
            maxLength={INVITATION_MESSAGE_MAX}
            multiline
          />
          <Button
            icon="entry"
            fullWidth
            loading={busy === "send"}
            disabled={busy !== null || (!pseudos.trim() && !emails.trim())}
            testID="invite-send"
            onPress={() =>
              void run("send", () =>
                api.inviteToEvent(id, {
                  pseudos: splitList(pseudos),
                  emails: splitList(emails),
                  vehicleIds: [],
                  message: message.trim() || null,
                }),
              )
            }
          >
            {L.send}
          </Button>

          <SectionTitle>Édition précédente</SectionTitle>
          {sources.data && sources.data.length > 0 ? (
            sources.data.map((src) => (
              <Plate key={src.id} style={styles.card}>
                <Text variant="caption" color={t.color.plateMuted}>
                  {formatDay(src.startsAt)} · {src.acceptedCount} retenus
                </Text>
                <Button
                  variant="plate"
                  icon="undo"
                  loading={busy === src.id}
                  disabled={busy !== null}
                  onPress={() => void run(src.id, () => api.inviteFromEvent(id, src.id, message.trim() || null))}
                >
                  {L.fromEvent(src.title)}
                </Button>
              </Plate>
            ))
          ) : (
            <Muted variant="body">{L.noSourceEvent}</Muted>
          )}
        </>
      )}

      <SectionTitle>{`${L.sentList} · ${sent.data?.length ?? 0}`}</SectionTitle>
      {sent.data && sent.data.length > 0 ? (
        sent.data.map((i) => (
          <Plate key={i.id} style={styles.row} testID="invitation-row">
            <View style={styles.rowText}>
              <Text variant="bodyStrong" color={t.color.plateInk}>
                {i.vehicle ? i.vehicle.label : (i.pseudo ?? i.email ?? "—")}
              </Text>
              <Text variant="caption" color={t.color.plateMuted}>
                {i.vehicle && i.pseudo ? `${i.pseudo} · ` : ""}
                {formatDayHour(i.createdAt)}
              </Text>
            </View>
            <Chip surface="plate" selected={i.status === "accepted"}>
              {invitationStatusLabels[i.status]}
            </Chip>
          </Plate>
        ))
      ) : (
        <Muted variant="body">{L.sentEmpty}</Muted>
      )}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  card: { gap: space2, padding: space3 },
  row: { flexDirection: "row", alignItems: "center", gap: space3, padding: space3 },
  rowText: { flex: 1, gap: 2 },
});
