// Explorer v2, segment Événements (lot 44, `s-explore`) : la ligne d'ordre (« Tous les événements, du plus proche au
// plus loin », position refusée → autour du département favori), le nombre de résultats, puis les cartes v2 (la
// première en vedette avec son affiche) ou la carte stylée avec l'aperçu de l'événement touché. Tri et filtres : API.
// Lot M4 (maquettes 3.1 à 3.3) : toutes les cartes en portrait (affiche à gauche), le tri choisi (`sort`), la ligne
// « 14 événements · distances depuis le centre du 66 » (ou « depuis ta position »).
import { Button, EmptyState, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type EventCard, explorerLabels, explorerV2Labels as L } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { nowMs } from "@/lib/clock";
import { type PosterRect, prefetchEvent, rememberEventCard } from "@/lib/eventPreview";
import { LoadError } from "@/ui/LoadError";
import { EVENT_LIST_BLOCKS, Waiting } from "@/ui/Waiting";
import { EventCardV2 } from "./EventCardV2";
import { ExplorerMap } from "./ExplorerMap";
import { eventPins } from "./mapPins";
import { activeFilters, type EventFilters, type EventSort, eventQuery } from "./queries";
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

/** Lot M4 : d'où partent les distances (ta position, sinon le centre du département favori). */
export function distanceBasis(
  filters: EventFilters,
  status: ExplorerPosition["status"],
  dept: string | null,
): string | null {
  if (filters.affinity) return L.sortAffinity;
  if (filters.followed) return L.sortFollowed;
  if (status === "on") return L.fromPosition;
  if (!dept) return null;
  return status === "denied" ? L.fromDeptDenied(dept) : L.fromDept(dept);
}

export function EventsSegment({
  q,
  filters,
  position,
  dept,
  view,
  sort = "distance",
  fromPrefs = false,
}: {
  q: string;
  filters: EventFilters;
  position: ExplorerPosition;
  dept: string | null;
  view: "list" | "map";
  /** Lot M4 : le tri de « Trier : … ▾ ». */
  sort?: EventSort;
  /** Lot M4 : la liste s'ouvre filtrée d'après « Tes préférences » (lot M6). */
  fromPrefs?: boolean;
}) {
  const { t } = useTheme();
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const ready = position.status !== "checking" && position.status !== "asking";
  const list = usePaged(
    (cursor) => api.exploreEvents(eventQuery(q, filters, position.position, view, new Date(nowMs()), cursor, sort)),
    [q, filters, position.position, view, sort],
    q ? 300 : 0,
    ready,
    // Lot M3 : la liste par défaut (sans texte ni filtre) s'affiche depuis le cache avant la position et l'API.
    !q && activeFilters(filters) === 0 && view === "list" ? `explore-events.${sort}` : undefined,
  );
  const items = list.items ?? [];
  const pins = useMemo(() => eventPins(list.items ?? []), [list.items]);
  const picked: EventCard[] = items.filter((e) => selected.includes(e.id));
  // Lot M3 : la fiche s'ouvre tout de suite avec la carte (aperçu), sa lecture part dès le toucher.
  const open = (e: EventCard, poster: PosterRect | null = null) => {
    rememberEventCard(e, poster);
    prefetchEvent(e.slug);
    router.push(`/e/${e.slug}`);
  };

  return (
    <>
      {/* `.xcount` : « 14 événements · distances depuis le centre du 66 · filtrés selon tes préférences ». */}
      <View style={styles.sortline} testID="sort-line">
        <Text variant="caption" color={t.color.inkMuted} style={styles.sortText}>
          {[
            list.items ? L.count(items.length, list.hasMore) : null,
            distanceBasis(filters, position.status, dept),
            fromPrefs ? L.fromPrefs : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>

      {/* Lot M3, tour 2 : l'erreur se réessaie à la main (la liste se revalide aussi au retour sur l'écran et du réseau). */}
      {list.error ? <LoadError message={list.error} onRetry={() => void list.reload()} /> : null}
      {list.items === null && !list.error ? (
        <Waiting blocks={EVENT_LIST_BLOCKS} label={L.loading} testID="explorer-loading" />
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
                <EventCardV2
                  key={e.id}
                  event={e}
                  portrait
                  onPressIn={() => prefetchEvent(e.slug)}
                  onPress={(r) => open(e, r)}
                />
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
        ? items.map((event) => (
            <EventCardV2
              key={event.id}
              event={event}
              portrait
              onPressIn={() => prefetchEvent(event.slug)}
              onPress={(r) => open(event, r)}
            />
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
  picked: { gap: space2 },
});
