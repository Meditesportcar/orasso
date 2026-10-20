// Casquette Organisateur, onglet Événements (DA v2, lot 52, prototype `s-oevents`) : « Créer un événement » (le seul
// bouton principal), deux segments « En cours · N » et « Brouillons · N », des cartes avec les compteurs (candidatures,
// retenues, à trier) et, pour un brouillon, ce qui lui manque. Les anciens événements sont derrière « … » : on peut les
// dupliquer ; la copie arrive sur la page du nouvel événement, qui explique l'invitation des retenus de l'édition
// précédente. Aucune règle métier ici (dates, publication, duplication : l'API).
import { Button, Chip, Counters, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type EventCard, type EventOrganizer, eventFormatLabels, orgaV2Labels as L, orgaLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { groupEvents } from "@/lib/orga";
import { draftMissing, publishedStatus } from "@/lib/orgaV2";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { AppSheet } from "@/ui/AppSheet";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { TabScreen } from "@/ui/Screens";
import { OrgaFailure, useOrga } from "../OrgaGate";

const { space1, space2, space3 } = tokens.spacing;

type Segment = "progress" | "drafts";

/** Les fiches détaillées des événements à venir et des brouillons (compteurs, ce qui manque), par identifiant. */
function useDetails(ids: readonly string[]) {
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
    { enabled: ids.length > 0 },
  );
}

function Counts({ detail }: { detail: EventOrganizer | undefined }) {
  const c = detail?.counters;
  const pending = c?.pending ?? 0;
  return (
    <Counters
      items={[
        { value: c ? c.accepted + c.pending + c.waitlisted + c.refused : "–", label: L.countApplications },
        { value: c?.accepted ?? "–", label: L.countAccepted },
        { value: c?.pending ?? "–", label: L.countPending },
      ]}
      active={pending > 0 ? 2 : undefined}
    />
  );
}

function ProgressCard({
  event,
  detail,
  at,
  onPress,
}: {
  event: EventCard;
  detail: EventOrganizer | undefined;
  at: Date;
  onPress: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={event.title} testID="orga-event-row">
      <Plate style={styles.card}>
        <View style={styles.chips}>
          <Chip surface="plate" variant={event.outlook === "uncertain" ? "accent" : "default"}>
            {publishedStatus(event.startsAt, event.endsAt, at)}
          </Chip>
        </View>
        <Text variant="posterM" color={c.plateInk}>
          {event.title}
        </Text>
        <Text variant="body" color={c.plateMuted}>
          {formatDayHour(event.startsAt)} · {eventFormatLabels[event.format]}
          {event.city ? ` · ${event.city}` : ""}
        </Text>
        <Counts detail={detail} />
      </Plate>
    </Pressable>
  );
}

function DraftCard({
  event,
  detail,
  at,
  onResume,
}: {
  event: EventCard;
  detail: EventOrganizer | undefined;
  at: Date;
  onResume: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const missing = detail ? draftMissing(detail, at) : null;
  return (
    <Plate style={styles.card} testID="orga-event-draft">
      <View style={styles.chips}>
        <Chip surface="plate">{L.statusDraft}</Chip>
      </View>
      <Text variant="posterM" color={c.plateInk}>
        {event.title}
      </Text>
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

  const ids = useMemo(() => [...groups.upcoming, ...groups.drafts].map((e) => e.id), [groups]);
  const details = useDetails(ids);
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
                  Ouvrir
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
            Fermer
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
      <View style={styles.chips}>
        <Chip selected={segment === "progress"} onPress={() => setSegment("progress")}>
          {L.segInProgress(groups.upcoming.length)}
        </Chip>
        <Chip selected={segment === "drafts"} onPress={() => setSegment("drafts")}>
          {L.segDrafts(groups.drafts.length)}
        </Chip>
      </View>
      {empty && !events.error ? (
        <Muted variant="body">{events.loading ? "Chargement…" : orgaLabels.eventsEmpty}</Muted>
      ) : null}
      {segment === "progress" ? (
        <>
          {!empty && groups.upcoming.length === 0 ? <Muted variant="body">{L.eventsNoneInProgress}</Muted> : null}
          {groups.upcoming.map((event) => (
            <ProgressCard
              key={event.id}
              event={event}
              detail={details.data?.[event.id]}
              at={at}
              onPress={() => router.push(`/evenement/${event.id}`)}
            />
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
              onResume={() => router.push(`/evenement/${event.id}/modifier`)}
            />
          ))}
        </>
      )}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  card: { gap: space1 + 2, padding: space3, marginBottom: space2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  top: { flexDirection: "row", gap: space2, alignItems: "stretch" },
  buttons: { flexDirection: "row", gap: space2 },
  grow: { flex: 1 },
});
