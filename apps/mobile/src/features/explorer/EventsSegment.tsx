// Explorer v2, segment Événements (lot 44, `s-explore`) : la ligne d'ordre (« Tous les événements, du plus proche au
// plus loin », position refusée → autour du département favori), le nombre de résultats, puis les cartes v2 (la
// première en vedette avec son affiche) ou la carte stylée avec l'aperçu de l'événement touché. Tri et filtres : API.
import { Button, EmptyState, OLoader, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type EventCard, explorerLabels, explorerV2Labels as L } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { nowMs } from "@/lib/clock";
import { Notice } from "@/ui/Notice";
import { EventCardV2 } from "./EventCardV2";
import { ExplorerMap } from "./ExplorerMap";
import { eventPins } from "./mapPins";
import { type EventFilters, eventQuery } from "./queries";
import type { ExplorerPosition } from "./useExplorerPosition";
import { usePaged } from "./usePaged";

const { space2 } = tokens.spacing;

/** La ligne d'ordre au-dessus de la liste. */
export function sortLine(filters: EventFilters, status: ExplorerPosition["status"], dept: string | null): string {
  if (filters.affinity) return L.sortAffinity;
  if (filters.followed) return L.sortFollowed;
  if (status === "on") return L.sortOn;
  if (!dept) return L.sortByDate;
  return status === "denied" ? L.sortDenied(dept) : L.sortAround(dept);
}

export function EventsSegment({
  q,
  filters,
  position,
  dept,
  view,
}: {
  q: string;
  filters: EventFilters;
  position: ExplorerPosition;
  dept: string | null;
  view: "list" | "map";
}) {
  const { t } = useTheme();
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const ready = position.status !== "checking" && position.status !== "asking";
  const list = usePaged(
    (cursor) => api.exploreEvents(eventQuery(q, filters, position.position, view, new Date(nowMs()), cursor)),
    [q, filters, position.position, view],
    q ? 300 : 0,
    ready,
  );
  const items = list.items ?? [];
  const pins = useMemo(() => eventPins(list.items ?? []), [list.items]);
  const picked: EventCard[] = items.filter((e) => selected.includes(e.id));
  const open = (e: EventCard) => router.push(`/e/${e.slug}`);

  return (
    <>
      <View style={styles.sortline} testID="sort-line">
        <Text variant="caption" color={t.color.inkMuted} style={styles.sortText}>
          {sortLine(filters, position.status, dept)}
        </Text>
        {list.items ? (
          <Text variant="caption" color={t.color.inkMuted} testID="results-count">
            {L.results(items.length, list.hasMore)}
          </Text>
        ) : null}
      </View>

      {list.error ? <Notice tone="error">{list.error}</Notice> : null}
      {list.items === null && !list.error ? (
        <View style={styles.loading} testID="explorer-loading">
          <OLoader label={L.loading} />
        </View>
      ) : null}
      {list.items?.length === 0 ? <EmptyState title={L.emptyTitle} text={L.emptyText} /> : null}

      {view === "map" && list.items ? (
        <ExplorerMap
          pins={pins}
          me={position.position}
          selectedId={selected.length === 1 ? selected[0] : null}
          onSelect={(p) => setSelected([p.id])}
          onSelectGroup={(group) => setSelected(group.map((p) => p.id))}
        >
          {picked.length > 0 ? (
            <View style={styles.picked} testID="map-picked">
              {picked.map((e) => (
                <EventCardV2 key={e.id} event={e} onPress={() => open(e)} />
              ))}
            </View>
          ) : (
            <Text variant="caption" color={t.color.inkMuted}>
              {pins.length > 0 ? L.mapHint : explorerLabels.mapNoPosition}
            </Text>
          )}
        </ExplorerMap>
      ) : null}
      {view === "list"
        ? items.map((event, i) => (
            <EventCardV2 key={event.id} event={event} big={i === 0} onPress={() => open(event)} />
          ))
        : null}
      {view === "list" && list.hasMore ? (
        <Button
          variant="secondary"
          icon="add"
          loading={list.loadingMore}
          onPress={() => void list.loadMore()}
          fullWidth
        >
          {explorerLabels.more}
        </Button>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  sortline: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space2 },
  sortText: { flex: 1 },
  loading: { alignItems: "center", paddingVertical: space2 },
  picked: { gap: space2 },
});
