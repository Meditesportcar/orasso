// Explorer v2, segment Pros (lot 29 ; lot 44 : en-tête commun, position partagée, du plus proche au plus loin quand
// on a une position ou un département favori, sinon par nom ; carte stylée avec les plaques des pros). Fiches
// supprimées, non publiées ou de comptes suspendus : jamais là.
import { Button, Chip, ChipRow, EmptyState, OLoader, Text, tokens, useTheme } from "@orasso/design-system/native";
import { explorerLabels, explorerV2Labels as L } from "@orasso/shared";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { Notice } from "@/ui/Notice";
import { ExplorerMap } from "./ExplorerMap";
import { ProFiltersSheet } from "./FiltersSheets";
import { proPins } from "./mapPins";
import { activeFilters, emptyProFilters, proQuery } from "./queries";
import { ProRow } from "./rows";
import type { ExplorerPosition } from "./useExplorerPosition";
import { usePaged } from "./usePaged";

const { space2 } = tokens.spacing;

export function ProsSegment({
  q,
  position,
  dept,
  view,
}: {
  q: string;
  position: ExplorerPosition;
  dept: string | null;
  view: "list" | "map";
}) {
  const { t } = useTheme();
  const [filters, setFilters] = useState(emptyProFilters);
  const [sheet, setSheet] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const sort = position.status === "on" || dept ? "distance" : "name";
  const ready = position.status !== "checking" && position.status !== "asking";

  const list = usePaged(
    (cursor) => api.explorePros(proQuery(q, filters, sort, position.position, view, cursor)),
    [q, filters, sort, position.position, view],
    q ? 300 : 0,
    ready,
  );
  const items = list.items ?? [];
  const pins = useMemo(() => proPins(list.items ?? []), [list.items]);
  const picked = items.filter((p) => selected.includes(p.slug));
  const count = activeFilters(filters);
  const line = position.status === "on" ? L.prosOn : dept ? L.prosAround(dept) : L.prosByName;

  return (
    <>
      <ChipRow>
        <Chip selected={count > 0} onPress={() => setSheet(true)}>
          {count > 0 ? `${L.filters} · ${count}` : L.filters}
        </Chip>
      </ChipRow>
      <View style={styles.sortline}>
        <Text variant="caption" color={t.color.inkMuted} style={styles.sortText}>
          {line}
        </Text>
        {list.items ? (
          <Text variant="caption" color={t.color.inkMuted}>
            {L.results(items.length, list.hasMore)}
          </Text>
        ) : null}
      </View>

      {list.error ? <Notice tone="error">{list.error}</Notice> : null}
      {list.items === null && !list.error ? (
        <View style={styles.loading}>
          <OLoader label={L.loading} />
        </View>
      ) : null}
      {list.items?.length === 0 ? <EmptyState title={L.emptyTitle} text={L.prosEmptyText} /> : null}

      {view === "map" && list.items ? (
        <ExplorerMap
          pins={pins}
          me={position.position}
          selectedId={selected.length === 1 ? selected[0] : null}
          onSelect={(p) => setSelected([p.id])}
          onSelectGroup={(group) => setSelected(group.map((p) => p.id))}
        >
          {picked.length > 0 ? (
            <View style={styles.picked}>
              {picked.map((p) => (
                <ProRow key={p.slug} pro={p} />
              ))}
            </View>
          ) : (
            <Text variant="caption" color={t.color.inkMuted}>
              {pins.length > 0 ? L.mapProHint : explorerLabels.mapNoPosition}
            </Text>
          )}
        </ExplorerMap>
      ) : null}
      {view === "list" ? items.map((pro) => <ProRow key={pro.slug} pro={pro} />) : null}
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

      <ProFiltersSheet visible={sheet} value={filters} onClose={() => setSheet(false)} onApply={setFilters} />
    </>
  );
}

const styles = StyleSheet.create({
  sortline: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space2 },
  sortText: { flex: 1 },
  loading: { alignItems: "center", paddingVertical: space2 },
  picked: { gap: space2 },
});
