// Explorer, segment Événements (lot 44, `s-explore`) : les cartes v2 (affiche à gauche, lot M4). Tri, filtres et lieu :
// appliqués par l'API.
// Lot R8x (maquette R8.9) : la ligne « 12 événements à venir · jusqu'à 100 km de toi » disparaît : le nombre est dans
// l'onglet (« Événements · 12 », lu par `ExplorerScreen`), la distance dans la pastille. La carte vit dans `ExplorerMapView`.
import { Button, EmptyState } from "@orasso/design-system/native";
import { type EventCard, explorerLabels, explorerV2Labels as L, notOver } from "@orasso/shared";
import { useRouter } from "expo-router";

import { api } from "@/lib/api";
import { nowMs } from "@/lib/clock";
import { type PosterRect, prefetchEvent, rememberEventCard } from "@/lib/eventPreview";
import { LoadError } from "@/ui/LoadError";
import { EVENT_LIST_BLOCKS, Waiting } from "@/ui/Waiting";
import { EventCardV2 } from "./EventCardV2";
import { activeFilters, type EventFilters, type EventSort, type ExplorerPlace, eventQuery, placeKey } from "./queries";
import type { ExplorerPosition } from "./useExplorerPosition";
import { usePaged } from "./usePaged";

/** Ouvrir la fiche tout de suite avec l'aperçu de la carte (lot M3) ; sa lecture part dès le toucher. */
export function useOpenEvent() {
  const router = useRouter();
  return (e: EventCard, poster: PosterRect | null = null) => {
    rememberEventCard(e, poster);
    prefetchEvent(e.slug);
    router.push(`/e/${e.slug}`);
  };
}

export function EventsSegment({
  q,
  filters,
  position,
  sort,
  place,
  settled = true,
}: {
  q: string;
  filters: EventFilters;
  position: ExplorerPosition;
  sort: EventSort;
  place: ExplorerPlace;
  /** Les réglages gardés (lot R1) et les préférences sont lus ; avant, ni requête ni cache. */
  settled?: boolean;
}) {
  const open = useOpenEvent();
  const ready = position.status !== "checking" && position.status !== "asking";
  const key = placeKey(place);
  const list = usePaged(
    (cursor) =>
      api.exploreEvents(eventQuery(q, filters, position.position, "list", new Date(nowMs()), cursor, sort, place)),
    [q, filters, position.position, sort, place],
    q ? 300 : 0,
    ready && settled,
    // Lot M3 : la liste par défaut (sans texte ni filtre) s'affiche depuis le cache avant la position et l'API ; une clé
    // par lieu, jamais pour « Autour de moi » (rien de la position sur l'appareil).
    settled && !q && activeFilters(filters) === 0 && key !== null
      ? `explore-events.${sort}.${key}${filters.formats?.length ? `.${filters.formats.join("+")}` : ""}`
      : undefined,
  );
  // Lot R1 : un événement terminé ne se montre plus, même lu du cache d'hier (l'API l'écarte déjà).
  const items = notOver(list.items ?? [], new Date(nowMs()));

  return (
    <>
      {/* Lot M3, tour 2 : l'erreur se réessaie à la main (la liste se revalide aussi au retour sur l'écran et du réseau). */}
      {list.error ? <LoadError message={list.error} onRetry={() => void list.reload()} /> : null}
      {list.items === null && !list.error ? (
        <Waiting blocks={EVENT_LIST_BLOCKS} label={L.loading} testID="explorer-loading" />
      ) : null}
      {list.items && items.length === 0 ? <EmptyState title={L.emptyTitle} text={L.emptyText} /> : null}

      {items.map((event) => (
        <EventCardV2
          key={event.id}
          event={event}
          portrait
          onPressIn={() => prefetchEvent(event.slug)}
          onPress={(r) => open(event, r)}
        />
      ))}
      {list.hasMore ? (
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
