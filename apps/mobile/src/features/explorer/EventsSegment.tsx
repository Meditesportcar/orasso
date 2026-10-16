// Explorer, segment Événements (lot 29) : liste ou carte, tri par affinités (S34) / date / distance, filtres en feuille
// (format, catégorie, département, dates, rayon), « Utiliser ma position » facultatif. Tri et filtres : dans l'API.
import { Button, Chip, ChipRow, TextField } from "@orasso/design-system/native";
import { type EventSort, explorerLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";

import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { ExplorerMap, mapSupported } from "./ExplorerMap";
import { EventFiltersSheet } from "./FiltersSheets";
import { eventPins } from "./mapPins";
import { activeFilters, emptyEventFilters, eventQuery } from "./queries";
import { EventRow } from "./rows";
import { useMyPosition } from "./useMyPosition";
import { usePaged } from "./usePaged";

const SORTS: { id: EventSort; label: string }[] = [
  { id: "affinity", label: explorerLabels.sortAffinity },
  { id: "date", label: explorerLabels.sortDate },
  { id: "distance", label: explorerLabels.sortDistance },
];

export function EventsSegment({ initialQ = "" }: { initialQ?: string }) {
  const router = useRouter();
  const categories = useApi(() => api.categories(), [], { cacheKey: "ref.categories" });
  const [q, setQ] = useState(initialQ);
  const [filters, setFilters] = useState(emptyEventFilters);
  const [sort, setSort] = useState<EventSort>("affinity");
  const [view, setView] = useState<"list" | "map">("list");
  const [sheet, setSheet] = useState(false);
  const me = useMyPosition();
  const mode = view === "map" ? "map" : "list";

  const list = usePaged(
    (cursor) => api.exploreEvents(eventQuery(q, filters, sort, me.position, mode, cursor)),
    [q, filters, sort, me.position, mode],
    q ? 300 : 0,
  );
  const pins = useMemo(() => eventPins(list.items ?? []), [list.items]);
  const noDistance =
    sort !== "date" &&
    !me.position &&
    (list.items?.length ?? 0) > 0 &&
    (list.items ?? []).every((e) => e.distanceKm == null);
  const showMap = view === "map";
  const mapHere = showMap && mapSupported;

  return (
    <>
      <TextField
        label={explorerLabels.searchTitle}
        placeholder="Nom d'événement, ville…"
        value={q}
        onChangeText={setQ}
        autoCapitalize="none"
        returnKeyType="search"
        testID="events-q"
      />
      <ChipRow>
        {SORTS.map((s) => (
          <Chip key={s.id} selected={sort === s.id} onPress={() => setSort(s.id)}>
            {s.label}
          </Chip>
        ))}
      </ChipRow>
      <ChipRow>
        <Chip selected={view === "list"} onPress={() => setView("list")}>
          {explorerLabels.list}
        </Chip>
        <Chip selected={view === "map"} onPress={() => setView("map")}>
          {explorerLabels.map}
        </Chip>
      </ChipRow>
      <Button variant="secondary" icon="list" onPress={() => setSheet(true)} fullWidth testID="open-filters">
        {activeFilters(filters) > 0 ? `${explorerLabels.filters} (${activeFilters(filters)})` : explorerLabels.filters}
      </Button>
      {me.position ? (
        <>
          <Muted variant="caption">{explorerLabels.usingPosition}</Muted>
          <Button variant="plate" icon="close" onPress={me.clear} fullWidth>
            {explorerLabels.stopPosition}
          </Button>
        </>
      ) : (
        <Button
          variant="secondary"
          icon="place"
          loading={me.status === "asking"}
          onPress={() => void me.request()}
          fullWidth
        >
          {explorerLabels.usePosition}
        </Button>
      )}
      {me.status === "denied" ? <Notice>{explorerLabels.positionDenied}</Notice> : null}
      {noDistance ? <Muted variant="caption">{explorerLabels.positionUnknown}</Muted> : null}

      {list.error ? <Notice tone="error">{list.error}</Notice> : null}
      {list.items === null && !list.error ? <Muted variant="body">Chargement…</Muted> : null}
      {list.items?.length === 0 ? <Muted variant="body">{explorerLabels.eventsEmpty}</Muted> : null}

      {showMap ? <ExplorerMap pins={pins} onOpen={(pin) => router.push(pin.href as never)} /> : null}
      {mapHere
        ? null
        : list.items?.map((event) => (
            <EventRow key={event.id} event={event} hints={sort !== "date" || me.position !== null} />
          ))}
      {!mapHere && list.hasMore ? (
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

      <EventFiltersSheet
        visible={sheet}
        value={filters}
        categories={categories.data ?? []}
        onClose={() => setSheet(false)}
        onApply={setFilters}
      />
    </>
  );
}
