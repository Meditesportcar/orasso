// Casquette Organisateur, « Inviter » (lot 25, docs/02 : page événement côté organisateur > inviter) : par pseudo, par
// véhicule (abonnés et retenus des éditions précédentes), par e-mail, avec un message ; « Inviter les retenus de
// l'édition … » ; puis la liste des invitations, leur statut et le retrait d'une invitation en attente. Lot 35b (D20) :
// mêmes possibilités que la page Invitations du site (véhicules proposés, retrait, statut de la candidature, e-mail non
// parti), avec une confirmation avant d'inviter toute une édition et avant de retirer une invitation.
// Ouvert depuis le bouton « Inviter » de la page événement de la casquette (lot 22) : `/evenement/<id>/inviter`.
import { Button, CheckboxField, Chip, Plate, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  applicationStatusLabels,
  eventEditorLabels as EL,
  INVITATION_MESSAGE_MAX,
  type InvitationCreateResult,
  type InvitationSourceEvent,
  invitationLabels,
  invitationSkipLabels,
  invitationStatusLabels,
  type OrganizerInvitation,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { ConfirmSheet } from "@/features/orga/ConfirmSheet";
import { OrgaFailure } from "@/features/orga/OrgaGate";
import { api } from "@/lib/api";
import { formatDay, formatDayHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen, SectionTitle } from "@/ui/Screens";

const L = invitationLabels;
const { space1, space2, space3 } = tokens.spacing;

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

function kindLabel(i: OrganizerInvitation): string {
  return i.kind === "email" ? L.targetEmail : i.kind === "vehicle" ? L.targetVehicle : L.targetUser;
}

export default function Inviter() {
  const { t } = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const event = useApi(() => api.eventForInvitations(id), [id]);
  const sources = useApi(() => api.invitationSources(id), [id]);
  const candidates = useApi(() => api.invitationCandidates(id), [id]);
  const sent = useApi(() => api.eventInvitations(id), [id]);
  const [pseudos, setPseudos] = useState("");
  const [emails, setEmails] = useState("");
  const [message, setMessage] = useState("");
  const [vehicleIds, setVehicleIds] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [source, setSource] = useState<InvitationSourceEvent | null>(null);
  const [removing, setRemoving] = useState<OrganizerInvitation | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);

  const close = () => (router.canGoBack() ? router.back() : router.replace(`/evenement/${id}`));
  const e = event.data;
  const closed = Boolean(e && (e.isLocked || e.status !== "published"));
  const invited = new Set((sent.data ?? []).flatMap((i) => (i.vehicle ? [i.vehicle.id] : [])));

  async function run(key: string, action: () => Promise<InvitationCreateResult>) {
    setBusy(key);
    setError(null);
    setSheetError(null);
    setNotice(null);
    try {
      const r = await action();
      setNotice(resultText(r));
      setPseudos("");
      setEmails("");
      setVehicleIds([]);
      setSource(null);
      await sent.reload();
    } catch (err) {
      if (key === "send") setError(err);
      else setSheetError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy("remove");
    setSheetError(null);
    try {
      await api.removeInvitation(id, removing.id);
      setRemoving(null);
      setNotice(EL.removed);
      await sent.reload();
    } catch (err) {
      setSheetError(errorMessage(err));
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
        await Promise.all([event.reload(), sources.reload(), candidates.reload(), sent.reload()]);
      }}
      overlays={
        <>
          <ConfirmSheet
            visible={source !== null}
            title={EL.fromEventTitle}
            body={source ? EL.fromEventBody(source.title, source.acceptedCount) : ""}
            confirmLabel={source ? L.fromEvent(source.title) : ""}
            confirmIcon="undo"
            busy={busy === "source"}
            error={sheetError}
            onConfirm={() =>
              source && void run("source", () => api.inviteFromEvent(id, source.id, message.trim() || null))
            }
            onClose={() => {
              setSource(null);
              setSheetError(null);
            }}
          />
          <ConfirmSheet
            visible={removing !== null}
            title={EL.removeTitle}
            body={EL.removeBody}
            confirmLabel={L.remove}
            confirmIcon="close"
            danger
            busy={busy === "remove"}
            error={sheetError}
            onConfirm={() => void remove()}
            onClose={() => {
              setRemoving(null);
              setSheetError(null);
            }}
          />
        </>
      }
    >
      <OrgaFailure error={event.error} />
      {e ? (
        <Muted variant="caption">
          {e.admission === "invite_only" ? `${L.privateEvent}. ` : ""}
          {L.validUntil(formatDayHour(e.lockAt))}
        </Muted>
      ) : null}
      {notice ? <Notice>{notice}</Notice> : null}
      <OrgaFailure error={error} />

      {closed ? (
        <Notice>{e?.status === "published" ? EL.lockedInvitations : EL.publishToInvite}</Notice>
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
            testID="invite-emails"
          />

          <SectionTitle>{L.inviteVehicles}</SectionTitle>
          <Muted variant="caption">{L.inviteVehiclesHint}</Muted>
          {candidates.data && candidates.data.length > 0 ? (
            <Plate style={styles.card} testID="invitation-candidates">
              {candidates.data.map((c) => {
                const already = invited.has(c.vehicleId);
                return (
                  <CheckboxField
                    key={c.vehicleId}
                    checked={already || vehicleIds.includes(c.vehicleId)}
                    disabled={already}
                    onChange={() =>
                      setVehicleIds((cur) =>
                        cur.includes(c.vehicleId) ? cur.filter((x) => x !== c.vehicleId) : [...cur, c.vehicleId],
                      )
                    }
                    label={
                      <View style={styles.rowText}>
                        <Text variant="bodyStrong" color={t.color.plateInk}>
                          {c.label}
                        </Text>
                        <Text variant="caption" color={t.color.plateMuted}>
                          {`${c.pseudo} · ${c.source === "past" ? EL.candidatePast : EL.candidateFollower}${already ? ` · ${EL.invitedAlready}` : ""}`}
                        </Text>
                      </View>
                    }
                  />
                );
              })}
            </Plate>
          ) : (
            <Muted variant="body">{candidates.loading ? "Chargement…" : L.noCandidates}</Muted>
          )}
          {vehicleIds.length > 0 ? <Muted variant="caption">{EL.invitationsSelected(vehicleIds.length)}</Muted> : null}

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
            disabled={busy !== null || (!pseudos.trim() && !emails.trim() && vehicleIds.length === 0)}
            testID="invite-send"
            onPress={() =>
              void run("send", () =>
                api.inviteToEvent(id, {
                  pseudos: splitList(pseudos),
                  emails: splitList(emails),
                  vehicleIds,
                  message: message.trim() || null,
                }),
              )
            }
          >
            {L.send}
          </Button>

          <SectionTitle>{EL.previousEdition}</SectionTitle>
          <Muted variant="caption">{L.fromEventHint}</Muted>
          {sources.data && sources.data.length > 0 ? (
            sources.data.map((src) => (
              <Plate key={src.id} style={styles.card} testID="invite-source">
                <Text variant="caption" color={t.color.plateMuted}>
                  {`${formatDay(src.startsAt)} · ${src.acceptedCount} retenus`}
                </Text>
                <Button
                  variant="plate"
                  icon="undo"
                  disabled={busy !== null}
                  onPress={() => setSource(src)}
                  testID="invite-from-event"
                >
                  {L.fromEvent(src.title)}
                </Button>
              </Plate>
            ))
          ) : (
            <Muted variant="body">{L.noSourceEvent}</Muted>
          )}
          <Muted variant="caption">{EL.invitedNotice}</Muted>
        </>
      )}

      <SectionTitle>{`${L.sentList} · ${sent.data?.length ?? 0}`}</SectionTitle>
      {sent.data && sent.data.length > 0 ? (
        sent.data.map((i) => (
          <Plate key={i.id} style={styles.card} testID="invitation-row">
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text variant="bodyStrong" color={t.color.plateInk}>
                  {i.vehicle ? i.vehicle.label : (i.pseudo ?? i.email ?? "—")}
                </Text>
                <Text variant="caption" color={t.color.plateMuted}>
                  {`${kindLabel(i)}${i.vehicle && i.pseudo ? ` · ${i.pseudo}` : ""} · ${formatDayHour(i.createdAt)}`}
                </Text>
                {i.application ? (
                  <Text variant="caption" color={t.color.plateMuted}>
                    {applicationStatusLabels[i.application.status]}
                  </Text>
                ) : null}
                {i.mailSkipped ? (
                  <Text variant="caption" color={t.color.plateMuted} testID="invitation-mail-skipped">
                    {L.mailSkipped}
                  </Text>
                ) : null}
              </View>
              <Chip surface="plate" selected={i.status === "accepted"}>
                {invitationStatusLabels[i.status]}
              </Chip>
            </View>
            {i.status === "pending" ? (
              <Button
                variant="plate"
                tone="dashed"
                icon="close"
                disabled={busy !== null}
                onPress={() => setRemoving(i)}
                testID="invitation-remove"
              >
                {L.remove}
              </Button>
            ) : null}
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
  row: { flexDirection: "row", alignItems: "center", gap: space3 },
  rowText: { flex: 1, gap: space1 / 2 },
});
