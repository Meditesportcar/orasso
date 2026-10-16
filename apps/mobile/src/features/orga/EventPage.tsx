// Casquette Organisateur, page d'un événement (lot 22, ARCHITECTURE-SUITE § 7.2) : compteurs de candidatures en direct
// (canal `triage`), bandeau et bascule Maintenu / Incertain avec confirmation, annulation (confirmation forte), consignes
// (écrire, envoyer), annonces du fil (avec photo, « prévenir »), invitations et bilan (« bientôt »), et renvoi vers le
// site pour créer et modifier. Rien ne se crée ni ne se modifie ici : docs/02 garde l'assistant sur le site.
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
  communicationLabels,
  type EventCounters,
  eventOutlookLabels,
  eventStatusLabels,
  orgaLabels,
} from "@orasso/shared";
import { useIsFocused, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { siteUrl } from "@/api";
import { FeedEntry } from "@/features/communication/EventFeed";
import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { cancelConfirmed, orgaSitePath, otherOutlook, remainingText, structureSlugOf } from "@/lib/orga";
import { useChannel } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { SectionTitle, TabScreen } from "@/ui/Screens";
import { ConfirmSheet } from "./ConfirmSheet";
import { NewAnnouncementSheet } from "./NewAnnouncementSheet";
import { OrgaFailure, useOrga } from "./OrgaGate";

const { space1, space2, space3 } = tokens.spacing;

type Sheet = "outlook" | "cancel" | "announcement" | "removeEntry" | null;

export function EventPage({ eventId }: { eventId: string }) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const focused = useIsFocused();
  const { structureId, structureName } = useOrga();
  const { me } = useSession();
  const at = useNow(60_000);
  const event = useApi(() => api.orgEvent(eventId), [eventId]);
  const feed = useApi(() => api.orgAnnouncements(eventId), [eventId]);
  const [counters, setCounters] = useState<EventCounters | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
  const slug = structureSlugOf(me?.memberships, structureId);
  const openSite = (tail: string) => slug && void Linking.openURL(siteUrl(orgaSitePath(slug, tail)));
  const reloadAll = async () => {
    await Promise.all([event.reload(), feed.reload()]);
  };
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
    try {
      await action();
      await reloadAll();
      if (done) setNotice(done);
      closeSheet();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const upcoming = e ? e.status === "published" && Date.parse(e.endsAt) > at.getTime() : false;
  const outlook = e?.outlook ?? "maintained";
  const nextOutlook = otherOutlook(outlook);
  const instructionsText = instructions ?? e?.instructions ?? "";

  return (
    <TabScreen
      title={orgaLabels.eventsTitle}
      facts={e?.title ?? structureName}
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

          {e.status === "draft" ? <Notice>{orgaLabels.draftNotice}</Notice> : null}

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
                active={1}
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

          <View style={styles.buttons}>
            <Button variant="plate" icon="share" disabled onPress={() => undefined} fullWidth>
              {orgaLabels.inviteSoon}
            </Button>
            <Button variant="plate" icon="list" disabled onPress={() => undefined} fullWidth>
              {orgaLabels.reportSoon}
            </Button>
            <Button
              variant="plate"
              icon="export"
              disabled={!slug}
              onPress={() => openSite(`/e/${eventId}/modifier`)}
              fullWidth
              testID="orga-edit-on-site"
            >
              {orgaLabels.eventsEditOnSite}
            </Button>
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
          </View>
        </>
      ) : null}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
  buttons: { gap: space2, marginTop: space2 },
  entryButtons: { flexDirection: "row", gap: space2, marginTop: space1, marginBottom: space2 },
});
