// Casquette Organisateur, onglet Événements (DA v2, lot 52, prototype `s-oevents`) : « Créer un événement » (le seul
// bouton principal), deux segments « En cours · N » et « Brouillons · N », des cartes avec les compteurs (candidatures,
// retenues, à trier) et, pour un brouillon, ce qui lui manque. Les anciens événements sont derrière « … » : on peut les
// dupliquer ; la copie arrive sur la page du nouvel événement, qui explique l'invitation des retenus de l'édition
// précédente. Aucune règle métier ici (dates, publication, duplication : l'API).
import { Button, Chip, Photo, Plate, Tag, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type EventCard, type EventOrganizer, orgaV2Labels as L, orgaLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { MinimalPoster } from "@/features/explorer/EventCardV2";
import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { groupEvents } from "@/lib/orga";
import { draftMissing, publishedStatus } from "@/lib/orgaV2";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { AppSheet } from "@/ui/AppSheet";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { TabScreen } from "@/ui/Screens";
import { Segments } from "@/ui/Segments";
import { OrgaFailure, useOrga } from "../OrgaGate";

const { space1, space2, space3 } = tokens.spacing;

type Segment = "progress" | "drafts";

/** Les fiches des seuls brouillons (pour dire ce qui leur manque), par identifiant ; gardées pour le hors ligne. */
function useDrafts(structureId: string, ids: readonly string[]) {
  const key = ids.join(",");
  return useApi(
    async () => {
      const entries = await Promise.all(
        ids.map(async (id) => {
          try {
            return [id, await api.orgEvent(id)] as const;
          } catch {
            return null;
          }
        }),
      );
      return Object.fromEntries(entries.filter((e): e is readonly [string, EventOrganizer] => e !== null));
    },
    [key],
    { enabled: ids.length > 0, cacheKey: `orga-drafts-${structureId}` },
  );
}

/** Les trois chiffres de l'artefact (`.counters` : chiffres étroits 26 px, libellé dessous, sans cases). */
function Counts({ counters: c }: { counters: EventCard["counters"] }) {
  const { t } = useTheme();
  const items = [
    { value: c ? c.accepted + c.pending + c.waitlisted + c.refused : "–", label: L.countApplications },
    { value: c?.accepted ?? "–", label: L.countAccepted },
    { value: c?.pending ?? "–", label: L.countPending },
  ];
  return (
    <View style={styles.counts}>
      {items.map((i) => (
        <View key={i.label} style={styles.count}>
          <Text variant="numberNarrow" color={t.color.ink} style={styles.countValue}>
            {String(i.value)}
          </Text>
          <Text variant="caption" color={t.color.inkMuted} style={styles.countLabel}>
            {i.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** La vignette de la carte : l'affiche générée, sinon le gabarit « Minimal » (jamais l'affiche personnelle). */
function Thumb({ event }: { event: EventCard }) {
  const { t } = useTheme();
  const source = mediaSource(event.generatedPosterUrl);
  return (
    <View style={[styles.thumb, { backgroundColor: t.color.poster }]} testID="orga-event-thumb">
      {source ? <Photo source={source} style={StyleSheet.absoluteFill} /> : <MinimalPoster event={event} big={false} />}
    </View>
  );
}

/** Carte `.oev` de l'artefact : vignette 4/5, étiquette « Publié · J-N » (moutarde dans le mois), titre, trois chiffres. */
function ProgressCard({ event, at, onPress }: { event: EventCard; at: Date; onPress: () => void }) {
  const { t } = useTheme();
  const c = t.color;
  const soon = Date.parse(event.startsAt) - at.getTime() < 30 * 86_400_000;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`${event.title}, ${formatDayHour(event.startsAt)}`}
      testID="orga-event-row"
      style={({ pressed }) => [
        styles.oev,
        { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard, opacity: pressed ? 0.9 : 1 },
      ]}
    >
      <Thumb event={event} />
      <View style={styles.headText}>
        <View style={styles.chips}>
          <Tag tone={soon || event.outlook === "uncertain" ? "acc" : "line"}>
            {publishedStatus(event.startsAt, event.endsAt, at)}
          </Tag>
        </View>
        <Text variant="posterS" color={c.ink} style={styles.oevTitle}>
          {event.title}
        </Text>
        <Counts counters={event.counters} />
      </View>
    </Pressable>
  );
}

function DraftCard({
  event,
  detail,
  at,
  structureVerified,
  onResume,
}: {
  event: EventCard;
  detail: EventOrganizer | undefined;
  at: Date;
  structureVerified: boolean;
  onResume: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const missing = detail ? draftMissing(detail, at, structureVerified) : null;
  return (
    <Plate style={styles.card} testID="orga-event-draft">
      <View style={styles.head}>
        <Thumb event={event} />
        <View style={styles.headText}>
          <View style={styles.chips}>
            <Chip surface="plate">{L.statusDraft}</Chip>
          </View>
          <Text variant="posterM" color={c.plateInk}>
            {event.title}
          </Text>
        </View>
      </View>
      {missing === null ? null : (
        <Text variant="body" color={c.plateMuted} testID="orga-draft-missing">
          {missing.length > 0 ? L.draftMissing(missing.join(", ")) : L.draftReady}
        </Text>
      )}
      <Button variant="plate" icon="next" onPress={onResume} fullWidth testID="orga-draft-resume">
        {L.draftResume}
      </Button>
    </Plate>
  );
}

export function EventsScreen() {
  const { t } = useTheme();
  const router = useRouter();
  const { structureId, structureName } = useOrga();
  const at = useNow(60_000);
  const events = useApi(() => api.structureEvents(structureId), [structureId], {
    cacheKey: `orga-events-${structureId}`,
  });
  const groups = useMemo(() => groupEvents(events.data ?? [], at), [events.data, at]);
  const [segment, setSegment] = useState<Segment>("progress");
  const [older, setOlder] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ids = useMemo(() => groups.drafts.map((e) => e.id), [groups]);
  const details = useDrafts(structureId, ids);
  const structure = useApi(() => api.orgStructure(structureId), [structureId]);
  // Tant que la structure n'est pas lue, on ne dit pas qu'elle manque de vérification.
  const structureVerified = structure.data ? structure.data.verification === "verified" : true;
  const olderList = useMemo(() => [...groups.past, ...groups.cancelled], [groups]);
  const empty = (events.data ?? []).length === 0;

  async function duplicate(event: EventCard) {
    setBusy(event.id);
    setError(null);
    try {
      const copy = await api.duplicateEvent(event.id);
      setOlder(false);
      await events.reload();
      router.push(`/evenement/${copy.id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const reload = async () => {
    await Promise.all([events.reload(), details.reload()]);
  };

  return (
    <TabScreen
      title={orgaLabels.eventsTitle}
      facts={structureName}
      onRefresh={reload}
      overlays={
        <AppSheet visible={older} onClose={() => setOlder(false)} accessibilityLabel={L.olderTitle}>
          <Text variant="title" color={t.color.ink}>
            {L.olderTitle}
          </Text>
          <Muted variant="caption">{L.olderIntro}</Muted>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {olderList.length === 0 ? <Muted variant="body">{L.olderEmpty}</Muted> : null}
          {olderList.map((event) => (
            <Plate key={event.id} style={styles.card} testID="orga-older-row">
              <Text variant="bodyStrong" color={t.color.plateInk}>
                {event.title}
              </Text>
              <Text variant="caption" color={t.color.plateMuted}>
                {formatDayHour(event.startsAt)}
                {event.status === "cancelled" ? ` · ${L.statusCancelled}` : ""}
              </Text>
              <View style={styles.buttons}>
                <Button
                  variant="plate"
                  icon="next"
                  onPress={() => {
                    setOlder(false);
                    router.push(`/evenement/${event.id}`);
                  }}
                  style={styles.grow}
                >
                  {L.open}
                </Button>
                <Button
                  variant="plate"
                  icon="add"
                  loading={busy === event.id}
                  disabled={busy !== null}
                  onPress={() => void duplicate(event)}
                  style={styles.grow}
                  testID="orga-older-duplicate"
                >
                  {L.duplicate}
                </Button>
              </View>
            </Plate>
          ))}
          <Button variant="plate" icon="close" onPress={() => setOlder(false)} fullWidth>
            {L.close}
          </Button>
        </AppSheet>
      }
    >
      <OrgaFailure error={events.error} />
      {events.offline ? <Notice>Hors ligne : dernière liste connue.</Notice> : null}
      <View style={styles.top}>
        <Button
          variant="primary"
          icon="add"
          onPress={() => router.push("/nouvel-evenement")}
          style={styles.grow}
          testID="orga-create-event"
        >
          {L.eventsCreate}
        </Button>
        <Button
          variant="plate"
          icon="list"
          onPress={() => {
            setError(null);
            setOlder(true);
          }}
          accessibilityLabel={L.eventsMore}
          testID="orga-events-more"
        >
          …
        </Button>
      </View>
      <Segments
        value={segment}
        onChange={setSegment}
        items={[
          { id: "progress", label: L.segInProgress(groups.upcoming.length) },
          { id: "drafts", label: L.segDrafts(groups.drafts.length) },
        ]}
      />
      {empty && !events.error ? (
        <Muted variant="body">{events.loading ? "Chargement…" : orgaLabels.eventsEmpty}</Muted>
      ) : null}
      {segment === "progress" ? (
        <>
          {!empty && groups.upcoming.length === 0 ? <Muted variant="body">{L.eventsNoneInProgress}</Muted> : null}
          {groups.upcoming.map((event) => (
            <ProgressCard key={event.id} event={event} at={at} onPress={() => router.push(`/evenement/${event.id}`)} />
          ))}
        </>
      ) : (
        <>
          {!empty && groups.drafts.length === 0 ? <Muted variant="body">{L.eventsNoDrafts}</Muted> : null}
          {groups.drafts.map((event) => (
            <DraftCard
              key={event.id}
              event={event}
              detail={details.data?.[event.id]}
              at={at}
              structureVerified={structureVerified}
              onResume={() => router.push(`/evenement/${event.id}/modifier`)}
            />
          ))}
        </>
      )}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", gap: space3 },
  headText: { flex: 1, gap: space1 + 2 },
  thumb: { width: 76, aspectRatio: 4 / 5, borderRadius: 10, overflow: "hidden" },
  oev: { flexDirection: "row", gap: 12, padding: 10, borderRadius: 18, marginBottom: space2 },
  oevTitle: { fontSize: 15, lineHeight: 17, textTransform: "uppercase", marginTop: 2 },
  counts: { flexDirection: "row", gap: 6, marginTop: 4 },
  count: { flex: 1 },
  countValue: { fontSize: 26, lineHeight: 26, fontWeight: "800" },
  countLabel: { fontSize: 11 },
  card: { gap: space1 + 2, padding: space3, marginBottom: space2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  top: { flexDirection: "row", gap: space2, alignItems: "stretch" },
  buttons: { flexDirection: "row", gap: space2 },
  grow: { flex: 1 },
});
