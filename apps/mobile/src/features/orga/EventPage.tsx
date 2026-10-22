// Casquette Organisateur, page d'un événement (lot 22, ARCHITECTURE-SUITE § 7.2) : compteurs de candidatures en direct
// (canal `triage`), bandeau et bascule Maintenu / Incertain avec confirmation, annulation (confirmation forte), consignes
// (écrire, envoyer), annonces du fil (avec photo, « prévenir »), invitations, bilan et remerciement (lot 27).
// Lot 35b (D20, tout se gère depuis l'appli) : « Modifier » ouvre l'assistant de l'appli, « Publier », « Dupliquer » et
// « Créer la série » (récurrence) passent par une confirmation, comme la page de l'événement du site.
import {
  Button,
  Chip,
  ChipRow,
  Counters,
  Plate,
  StatusBadge,
  Text,
  TextField,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import {
  afterEventLabels,
  communicationLabels,
  describeRecurrence,
  eventEditorLabels as EL,
  type EventCounters,
  eventOutlookLabels,
  eventStatusLabels,
  invitationLabels,
  orgaLabels,
  orgaV2Labels,
  ticketingAppLabels,
  triageAppLabels,
  wizardEndLabels,
} from "@orasso/shared";
import { useIsFocused, useRouter } from "expo-router";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { FeedEntry } from "@/features/communication/EventFeed";
import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { cancelConfirmed, otherOutlook, remainingText } from "@/lib/orga";
import { useChannel } from "@/lib/realtime";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen, SectionTitle } from "@/ui/Screens";
import { ConfirmSheet } from "./ConfirmSheet";
import { NewAnnouncementSheet } from "./NewAnnouncementSheet";
import { OrgaFailure, useOrga } from "./OrgaGate";
import { RecurrenceSheet } from "./RecurrenceSheet";

const { space1, space2, space3 } = tokens.spacing;

type Sheet = "outlook" | "cancel" | "announcement" | "removeEntry" | "publish" | "duplicate" | "recurrence" | null;

export function EventPage({
  eventId,
  done = null,
  warning = null,
}: {
  eventId: string;
  /** Retour de l'assistant (lot 35b) : `cree`, `modifie` ou `publie` (lot 36). */
  done?: string | null;
  /** Avertissement de l'assistant (affiche ou zone non enregistrée). */
  warning?: string | null;
}) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const focused = useIsFocused();
  const { structureId, structureName } = useOrga();
  const at = useNow(60_000);
  const event = useApi(() => api.orgEvent(eventId), [eventId]);
  const feed = useApi(() => api.orgAnnouncements(eventId), [eventId]);
  const structure = useApi(() => api.orgStructure(structureId), [structureId]);
  const [counters, setCounters] = useState<EventCounters | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(() =>
    done === "cree"
      ? EL.created
      : done === "modifie"
        ? EL.saved
        : done === "publie"
          ? wizardEndLabels.publishedDone
          : null,
  );
  const [failure, setFailure] = useState<unknown>(null);
  const [typed, setTyped] = useState("");
  const [motif, setMotif] = useState("");
  const [instructions, setInstructions] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const e = event.data;
  // Les compteurs de l'API, puis ceux du canal `triage` (chaque décision les renvoie).
  useEffect(() => {
    if (e) setCounters(e.counters);
  }, [e]);
  useChannel(focused && e ? `event:${eventId}:triage` : null, (message) => {
    if (message.type === "counters") setCounters(message.payload as EventCounters);
  });

  // Un événement d'une autre structure (même compte, autre casquette) ne s'ouvre pas sous celle-ci.
  const foreign = e ? e.structure.id !== structureId : false;
  const verified = structure.data?.verified ?? true;
  const reloadAll = async () => {
    await Promise.all([event.reload(), feed.reload()]);
  };
  // Lot C4a, tour 2 : après « Publier » ou « Modifier », l'assistant ouvre une page neuve de l'événement ; celle restée
  // dessous dans la pile se relit à son retour au premier plan (jamais un statut « Brouillon » périmé).
  const wasFocused = useRef(focused);
  useEffect(() => {
    if (focused && !wasFocused.current) void Promise.all([event.reload(), feed.reload()]);
    wasFocused.current = focused;
  }, [focused, event.reload, feed.reload]);
  const closeSheet = () => {
    setSheet(null);
    setError(null);
    setTyped("");
    setMotif("");
    setRemoving(null);
  };

  async function run(action: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setError(null);
    setFailure(null);
    try {
      await action();
      await reloadAll();
      if (done) setNotice(done);
      closeSheet();
    } catch (err) {
      setError(errorMessage(err));
      setFailure(err);
    } finally {
      setBusy(false);
    }
  }

  /** Dupliquer : la copie (brouillon) s'ouvre dans l'assistant, comme sur le site. */
  async function duplicate() {
    setBusy(true);
    setError(null);
    setFailure(null);
    try {
      const copy = await api.duplicateEvent(eventId);
      closeSheet();
      router.push({ pathname: "/evenement/[id]/modifier", params: { id: copy.id, copie: "1" } });
    } catch (err) {
      setError(errorMessage(err));
      setFailure(err);
    } finally {
      setBusy(false);
    }
  }

  const upcoming = e ? e.status === "published" && Date.parse(e.endsAt) > at.getTime() : false;
  const outlook = e?.outlook ?? "maintained";
  const nextOutlook = otherOutlook(outlook);
  const instructionsText = instructions ?? e?.instructions ?? "";

  return (
    <FlowScreen
      title={e?.title ?? orgaLabels.eventsTitle}
      facts={structureName}
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/evenements"))}
      onRefresh={reloadAll}
      overlays={
        <>
          <ConfirmSheet
            visible={sheet === "outlook"}
            title={orgaLabels.outlookTitle}
            body={
              nextOutlook === "uncertain" ? orgaLabels.outlookConfirmUncertain : orgaLabels.outlookConfirmMaintained
            }
            confirmLabel={
              nextOutlook === "uncertain" ? orgaLabels.outlookSetUncertain : orgaLabels.outlookSetMaintained
            }
            confirmIcon="alert"
            busy={busy}
            error={error}
            onConfirm={() => void run(() => api.setOutlook(eventId, nextOutlook))}
            onClose={closeSheet}
          />
          <ConfirmSheet
            visible={sheet === "cancel"}
            title={orgaLabels.cancelTitle}
            body={orgaLabels.cancelWarning}
            confirmLabel={orgaLabels.cancelConfirm}
            confirmIcon="close"
            cancelLabel={orgaLabels.cancelKeep}
            danger
            busy={busy}
            disabled={!cancelConfirmed(typed, orgaLabels.cancelWord)}
            error={error}
            onConfirm={() =>
              void run(async () => {
                await api.cancelEvent(eventId);
                // Le motif rejoint le fil (l'annulation a déjà prévenu les inscrits : pas de seconde notification).
                if (motif.trim() !== "") {
                  await api.postAnnouncement(eventId, {
                    body: `${orgaLabels.cancelReasonPrefix} ${motif.trim()}`,
                    notify: false,
                    pinned: true,
                    audience: "public",
                  });
                }
              }, orgaLabels.cancelDone)
            }
            onClose={closeSheet}
          >
            <TextField
              label={orgaLabels.cancelReason}
              value={motif}
              onChangeText={setMotif}
              multiline
              maxLength={400}
              testID="orga-cancel-reason"
            />
            <TextField
              label={orgaLabels.cancelTypeToConfirm}
              value={typed}
              onChangeText={setTyped}
              autoCapitalize="characters"
              autoCorrect={false}
              testID="orga-cancel-word"
            />
          </ConfirmSheet>
          <ConfirmSheet
            visible={sheet === "removeEntry"}
            title={communicationLabels.remove}
            body={communicationLabels.removeConfirm}
            confirmLabel={orgaLabels.announcementDelete}
            confirmIcon="close"
            danger
            busy={busy}
            error={error}
            onConfirm={() => removing && void run(() => api.deleteAnnouncement(eventId, removing))}
            onClose={closeSheet}
          />
          <ConfirmSheet
            visible={sheet === "publish"}
            title={EL.publishTitle}
            body={EL.publishBody}
            confirmLabel={EL.publish}
            confirmIcon="check"
            busy={busy}
            error={error}
            onConfirm={() => void run(() => api.publishEvent(eventId), EL.published)}
            onClose={closeSheet}
          />
          <ConfirmSheet
            visible={sheet === "duplicate"}
            title={EL.duplicateTitle}
            body={EL.duplicateBody}
            confirmLabel={EL.duplicateConfirm}
            confirmIcon="add"
            busy={busy}
            error={error}
            onConfirm={() => void duplicate()}
            onClose={closeSheet}
          />
          {e ? (
            <RecurrenceSheet
              visible={sheet === "recurrence"}
              event={e}
              busy={busy}
              error={error}
              onConfirm={(rule) =>
                void run(async () => {
                  const series = await api.createRecurrence(eventId, rule);
                  setNotice(EL.recurrenceDone(series.length));
                })
              }
              onClose={closeSheet}
            />
          ) : null}
          <NewAnnouncementSheet
            eventId={eventId}
            visible={sheet === "announcement"}
            onClose={closeSheet}
            onPublished={() => {
              closeSheet();
              setNotice(communicationLabels.announcementPublished);
              void feed.reload();
            }}
          />
        </>
      }
    >
      <Button variant="plate" icon="back" onPress={() => router.replace("/evenements")} fullWidth>
        {orgaLabels.eventsBack}
      </Button>
      <OrgaFailure error={event.error} />
      {foreign ? <Notice tone="error">{orgaLabels.foreignEvent}</Notice> : null}
      {notice ? <Notice>{notice}</Notice> : null}
      {warning ? <Notice tone="error">{warning}</Notice> : null}
      {sheet === null && failure ? <OrgaFailure error={failure} /> : null}

      {e && !foreign ? (
        <>
          <Plate style={styles.block} testID="orga-event-head">
            <ChipRow>
              <Chip surface="plate">{eventStatusLabels[e.status]}</Chip>
              {e.status === "published" ? (
                <Chip surface="plate" variant={outlook === "uncertain" ? "accent" : "default"} selected={false}>
                  {orgaLabels.outlookBanner(eventOutlookLabels[outlook])}
                </Chip>
              ) : null}
            </ChipRow>
            <Text variant="posterM" color={c.plateInk}>
              {e.title}
            </Text>
            <Text variant="body" color={c.plateMuted}>
              {formatDayHour(e.startsAt)}
              {e.city ? ` · ${e.city}` : ""}
            </Text>
            {e.status === "cancelled" ? <StatusBadge status="cancelled" onPlate /> : null}
          </Plate>
          {/* Lot 52 : une copie d'une édition passée dit qu'on peut en inviter les retenus. */}
          {e.parentEventId && e.status !== "cancelled" ? (
            <Plate kind="note" style={styles.block} testID="orga-reinvite">
              <Text variant="bodyStrong" color={c.plateInk}>
                {orgaV2Labels.reinviteTitle}
              </Text>
              <Text variant="caption" color={c.plateMuted}>
                {orgaV2Labels.reinviteBody}
              </Text>
              <Button
                variant="plate"
                icon="share"
                onPress={() => router.push(`/evenement/${eventId}/inviter`)}
                fullWidth
                testID="orga-reinvite-open"
              >
                {orgaV2Labels.reinviteOpen}
              </Button>
            </Plate>
          ) : null}

          {e.status === "draft" ? (
            <>
              <Notice>{EL.draftNotice}</Notice>
              {!verified ? (
                <Plate kind="note" style={styles.block} testID="orga-publish-blocked">
                  <Text variant="body" color={c.plateInk}>
                    {EL.publishBlocked}
                  </Text>
                  <Button variant="plate" icon="check" onPress={() => router.push("/(orga)/structure")} fullWidth>
                    {EL.publishBlockedLink}
                  </Button>
                </Plate>
              ) : null}
              <Button
                variant="primary"
                icon="check"
                disabled={!verified}
                onPress={() => setSheet("publish")}
                fullWidth
                testID="orga-publish"
              >
                {EL.publish}
              </Button>
            </>
          ) : null}

          {e.status === "published" && outlook === "uncertain" ? (
            <Plate kind="note" style={styles.block} testID="orga-outlook-banner">
              <Text variant="bodyStrong" color={c.plateInk}>
                {orgaLabels.outlookUncertainBanner}
              </Text>
            </Plate>
          ) : null}

          {e.status !== "draft" && counters ? (
            <>
              <SectionTitle>{orgaLabels.eventCounters}</SectionTitle>
              <Counters
                items={[
                  { value: counters.accepted, label: orgaLabels.eventAccepted },
                  { value: counters.pending, label: orgaLabels.eventPending },
                  { value: counters.waitlisted, label: orgaLabels.eventWaitlisted },
                  { value: remainingText(counters, orgaLabels.eventUnlimited), label: orgaLabels.eventRemaining },
                ]}
                active={counters.pending > 0 ? 1 : undefined}
              />
            </>
          ) : null}

          {upcoming ? (
            <View style={styles.buttons}>
              <Button
                variant="primary"
                icon="add"
                onPress={() => setSheet("announcement")}
                fullWidth
                testID="orga-announcement-new"
              >
                {orgaLabels.announcementNew}
              </Button>
              <Button
                variant="plate"
                icon="alert"
                onPress={() => setSheet("outlook")}
                fullWidth
                testID="orga-outlook-toggle"
              >
                {nextOutlook === "uncertain" ? orgaLabels.outlookSetUncertain : orgaLabels.outlookSetMaintained}
              </Button>
            </View>
          ) : null}

          {e.status === "published" ? (
            <>
              <SectionTitle>{orgaLabels.instructionsTitle}</SectionTitle>
              <Plate style={styles.block} testID="orga-instructions">
                <TextField
                  label={orgaLabels.instructionsTitle}
                  value={instructionsText}
                  onChangeText={setInstructions}
                  multiline
                  maxLength={2000}
                  help={communicationLabels.instructionsHint}
                  editable={upcoming}
                  testID="orga-instructions-input"
                />
                {upcoming ? (
                  <>
                    <Button
                      variant="plate"
                      icon="check"
                      disabled={busy || instructions === null}
                      onPress={() =>
                        void run(
                          () => api.saveInstructions(eventId, instructionsText.trim() || null),
                          orgaLabels.instructionsSaved,
                        )
                      }
                      fullWidth
                    >
                      {orgaLabels.instructionsSave}
                    </Button>
                    <Button
                      variant="secondary"
                      icon="share"
                      disabled={busy || instructionsText.trim() === ""}
                      onPress={() =>
                        void run(
                          () => api.sendInstructions(eventId, instructionsText.trim()),
                          communicationLabels.instructionsSent,
                        )
                      }
                      fullWidth
                    >
                      {communicationLabels.instructionsSend}
                    </Button>
                  </>
                ) : null}
              </Plate>
            </>
          ) : null}

          {e.status !== "draft" ? (
            <>
              <SectionTitle>{orgaLabels.announcementsTitle}</SectionTitle>
              {(feed.data?.items ?? []).length === 0 ? (
                <Muted variant="body">{feed.loading ? "Chargement…" : orgaLabels.feedEmpty}</Muted>
              ) : (
                <Plate style={styles.block} testID="orga-feed">
                  {(feed.data?.items ?? []).map((item) => (
                    <View key={item.id}>
                      <FeedEntry item={item} />
                      {item.kind === "announcement" ? (
                        <View style={styles.entryButtons}>
                          <Button
                            variant="plate"
                            icon="list"
                            disabled={busy}
                            onPress={() => void run(() => api.pinAnnouncement(eventId, item.id, !item.pinned))}
                          >
                            {item.pinned ? communicationLabels.unpin : communicationLabels.pin}
                          </Button>
                          <Button
                            variant="plate"
                            tone="dashed"
                            icon="close"
                            disabled={busy}
                            onPress={() => {
                              setRemoving(item.id);
                              setSheet("removeEntry");
                            }}
                          >
                            {orgaLabels.announcementDelete}
                          </Button>
                        </View>
                      ) : null}
                    </View>
                  ))}
                </Plate>
              )}
            </>
          ) : null}

          {e.status !== "cancelled" && !e.parentEventId && !e.recurrenceRule ? (
            <>
              <SectionTitle>{EL.recurrenceTitle}</SectionTitle>
              <Plate style={styles.block} testID="orga-recurrence">
                <Text variant="body" color={c.plateMuted}>
                  {EL.recurrenceIntro}
                </Text>
                <Button variant="plate" icon="calendar" onPress={() => setSheet("recurrence")} fullWidth>
                  {EL.recurrenceCreate}
                </Button>
              </Plate>
            </>
          ) : null}
          {e.recurrenceRule ? (
            <>
              <SectionTitle>{EL.recurrenceTitle}</SectionTitle>
              <Plate style={styles.block}>
                <Text variant="body" color={c.plateInk}>
                  {`${describeRecurrence(e.recurrenceRule)}.`}
                </Text>
              </Plate>
            </>
          ) : null}
          {e.vendorTypes.length > 0 ? (
            <>
              <SectionTitle>{EL.vendorsExpected}</SectionTitle>
              <Plate style={styles.block} testID="orga-vendor-types">
                <Text variant="body" color={c.plateInk}>
                  {e.vendorTypes.join(" · ")}
                </Text>
              </Plate>
            </>
          ) : null}

          {/* Lot C4a (ECARTS § 5.2) : les actions rangées en trois blocs, Avant / Le jour J / Après, au lieu de huit boutons. */}
          <ActionBlock title={orgaV2Labels.eventBlockBefore} testID="orga-block-before">
            {/* Tri par glissement (lot 23), seulement s'il y a des candidatures à trier. */}
            {e.status === "published" && counters && counters.pending > 0 ? (
              <Button
                variant="secondary"
                icon="check"
                onPress={() => router.push({ pathname: "/tri", params: { event: eventId } })}
                fullWidth
                testID="orga-event-sort"
              >
                {triageAppLabels.sortThis(counters.pending)}
              </Button>
            ) : null}
            {/* Invitations nominatives (lot 25). */}
            <Button
              variant="secondary"
              icon="entry"
              onPress={() => router.push(`/evenement/${eventId}/inviter`)}
              fullWidth
              testID="orga-invite"
            >
              {invitationLabels.invite}
            </Button>
            {/* Billetterie des visiteurs (lot 35c) : billets, places, prix, compte de paiement. */}
            {e.status !== "cancelled" ? (
              <Button
                variant="secondary"
                icon="qr"
                onPress={() => router.push(`/evenement/${eventId}/billetterie`)}
                fullWidth
                testID="orga-ticketing"
              >
                {ticketingAppLabels.open}
              </Button>
            ) : null}
            {e.status !== "cancelled" ? (
              <Button
                variant="secondary"
                icon="edit"
                onPress={() => router.push(`/evenement/${eventId}/modifier`)}
                fullWidth
                testID="orga-edit"
              >
                {EL.edit}
              </Button>
            ) : null}
            {upcoming ? (
              <Button
                variant="plate"
                tone="dashed"
                icon="close"
                onPress={() => setSheet("cancel")}
                fullWidth
                testID="orga-cancel-event"
              >
                {orgaLabels.cancelEvent}
              </Button>
            ) : null}
          </ActionBlock>
          {e.status === "published" ? (
            <ActionBlock title={orgaV2Labels.eventBlockDay} testID="orga-block-day">
              <Button
                variant="secondary"
                icon="share"
                onPress={() => router.push(`/e/${e.slug}`)}
                fullWidth
                testID="orga-public-page"
              >
                {EL.publicPage}
              </Button>
            </ActionBlock>
          ) : null}
          <ActionBlock title={orgaV2Labels.eventBlockAfter} testID="orga-block-after">
            {/* Bilan et « Remercier les présents » (lot 27), une fois l'événement commencé. */}
            <Button
              variant="secondary"
              icon="list"
              disabled={e.status !== "published"}
              onPress={() => router.push(`/evenement/${eventId}/bilan`)}
              fullWidth
              testID="orga-report"
            >
              {afterEventLabels.reportTitle} · {afterEventLabels.thanksTitle}
            </Button>
            <Button
              variant="secondary"
              icon="copy"
              onPress={() => setSheet("duplicate")}
              fullWidth
              testID="orga-duplicate"
            >
              {EL.duplicate}
            </Button>
          </ActionBlock>
        </>
      ) : null}
    </FlowScreen>
  );
}

/** Un bloc d'actions de la page (carte de l'artefact : titre italique, boutons empilés). */
function ActionBlock({ title, testID, children }: { title: string; testID?: string; children: ReactNode }) {
  const { t } = useTheme();
  return (
    <View style={[styles.actionBlock, { backgroundColor: t.color.surface }]} testID={testID}>
      <Text variant="posterS" color={t.color.ink} style={styles.actionTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
  actionBlock: { gap: space2, padding: 14, borderRadius: 18, marginTop: space2 },
  actionTitle: { fontSize: 15, lineHeight: 17, textTransform: "uppercase" },
  buttons: { gap: space2, marginTop: space2 },
  entryButtons: { flexDirection: "row", flexWrap: "wrap", gap: space2, marginTop: space1, marginBottom: space2 },
});
