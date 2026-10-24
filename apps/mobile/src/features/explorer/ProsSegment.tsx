// Explorer v2, segment Pros (lot 29 ; lot 44 : en-tête commun, position partagée, du plus proche au plus loin quand
// on a une position ou un département favori, sinon par nom ; carte stylée avec les plaques des pros). Fiches
// supprimées, non publiées ou de comptes suspendus : jamais là.
// Lot C2a : les lieux pratiques retirés de l'Accueil (garage favori, lavage, carburant ; audit § 5.2) vivent ici, en tête
// de la liste ; les filtres peuvent venir d'Explorer (`filters` / `onFiltersChange`) pour que la carte plein écran les garde.
import { Button, Chip, ChipRow, EmptyState, OLoader, Text, tokens, useTheme } from "@orasso/design-system/native";
import { explorerLabels, homeWidgetOffered, explorerV2Labels as L } from "@orasso/shared";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { FavoriteGarageWidget, PlacesWidget } from "@/features/home/HomeWidgets";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Notice } from "@/ui/Notice";
import { ExplorerMap } from "./ExplorerMap";
import { ProFiltersSheet } from "./FiltersSheets";
import { proPins } from "./mapPins";
import { activeFilters, emptyProFilters, type ProFilters, proQuery } from "./queries";
import { ProRow } from "./rows";
import type { ExplorerPosition } from "./useExplorerPosition";
import { usePaged } from "./usePaged";

const { space2 } = tokens.spacing;

export function ProsSegment({
  q,
  position,
  dept,
  view,
  filters: controlled,
  onFiltersChange,
  places = false,
}: {
  q: string;
  position: ExplorerPosition;
  dept: string | null;
  view: "list" | "map";
  filters?: ProFilters;
  onFiltersChange?: (next: ProFilters) => void;
  /** Lieux pratiques en tête (liste d'Explorer). */
  places?: boolean;
}) {
  const { t } = useTheme();
  const [own, setOwn] = useState(controlled ?? emptyProFilters);
  // Contrôlés par Explorer (liste) ; sinon (carte), ceux reçus au départ puis ceux de la feuille de filtres.
  const filters = onFiltersChange && controlled ? controlled : own;
  const setFilters = (next: ProFilters) => (onFiltersChange ? onFiltersChange(next) : setOwn(next));
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
      {places && view === "list" ? <PracticalPlaces position={position} /> : null}
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

/**
 * Lieux pratiques (lot 30, retirés de l'Accueil au lot C2a) : garage favori, lavage et carburant les plus proches, lus
 * par `GET /me/home?blocks=places` (ni sponsorisé ni incitation : rien n'y est compté). Lot R1 : lavage et carburant
 * retirés pour l'instant (décision de Damien du 24/10), il reste le garage favori.
 */
function PracticalPlaces({ position }: { position: ExplorerPosition }) {
  const data = useApi(
    () =>
      api.homeData({
        persona: "fan",
        blocks: "places",
        lat: position.position?.lat,
        lng: position.position?.lng,
      }),
    [position.position?.lat, position.position?.lng],
    { cacheKey: "explorer-places" },
  );
  if (!data.data) return null;
  return (
    <View style={styles.places} testID="explorer-places">
      <FavoriteGarageWidget garage={data.data.favoriteGarage} />
      {/* Lot R1 (décision de Damien du 24/10) : stations retirées pour l'instant (`NEARBY_STATIONS_ENABLED`). */}
      {homeWidgetOffered("wash") ? <PlacesWidget kind="wash" places={data.data.wash} /> : null}
      {homeWidgetOffered("fuel") ? <PlacesWidget kind="fuel" places={data.data.fuel} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  places: { gap: space2 },
  sortline: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space2 },
  sortText: { flex: 1 },
  loading: { alignItems: "center", paddingVertical: space2 },
  picked: { gap: space2 },
});
