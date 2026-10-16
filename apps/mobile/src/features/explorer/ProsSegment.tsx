// Explorer, segment Pros (lot 29) : même principe que les événements (liste ou carte, filtres activité et département,
// tri par nom ou distance, position facultative). Fiches supprimées, non publiées ou de comptes suspendus : jamais là.
import { Button, Chip, ChipRow, TextField } from "@orasso/design-system/native";
import { explorerLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";

import { api } from "@/lib/api";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { ExplorerMap, mapSupported } from "./ExplorerMap";
import { ProFiltersSheet } from "./FiltersSheets";
import { proPins } from "./mapPins";
import { activeFilters, emptyProFilters, proQuery } from "./queries";
import { ProRow } from "./rows";
import { useMyPosition } from "./useMyPosition";
import { usePaged } from "./usePaged";

export function ProsSegment({ initialQ = "" }: { initialQ?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initialQ);
  const [filters, setFilters] = useState(emptyProFilters);
  const [sort, setSort] = useState<"name" | "distance">("name");
  const [view, setView] = useState<"list" | "map">("list");
  const [sheet, setSheet] = useState(false);
  const me = useMyPosition();
  const mode = view === "map" ? "map" : "list";

  const list = usePaged(
    (cursor) => api.explorePros(proQuery(q, filters, sort, me.position, mode, cursor)),
    [q, filters, sort, me.position, mode],
    q ? 300 : 0,
  );
  const pins = useMemo(() => proPins(list.items ?? []), [list.items]);
  const noDistance =
    sort === "distance" &&
    !me.position &&
    (list.items?.length ?? 0) > 0 &&
    (list.items ?? []).every((p) => p.distanceKm == null);
  const showMap = view === "map";
  const mapHere = showMap && mapSupported;

  return (
    <>
      <TextField
        label={explorerLabels.searchTitle}
        placeholder="Nom, ville ou activité"
        value={q}
        onChangeText={setQ}
        autoCapitalize="none"
        returnKeyType="search"
        testID="pros-q"
      />
      <ChipRow>
        <Chip selected={sort === "name"} onPress={() => setSort("name")}>
          {explorerLabels.sortName}
        </Chip>
        <Chip selected={sort === "distance"} onPress={() => setSort("distance")}>
          {explorerLabels.sortDistance}
        </Chip>
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
      {list.items?.length === 0 ? <Muted variant="body">{explorerLabels.prosEmpty}</Muted> : null}

      {showMap ? <ExplorerMap pins={pins} onOpen={(pin) => router.push(pin.href as never)} /> : null}
      {mapHere ? null : list.items?.map((pro) => <ProRow key={pro.slug} pro={pro} />)}
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

      <ProFiltersSheet visible={sheet} value={filters} onClose={() => setSheet(false)} onApply={setFilters} />
    </>
  );
}
