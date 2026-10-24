// La carte de l'Explorer, dans l'onglet (lot R2, maquette R2.8) : sous la bande ORASSO (décision de Damien du 24/10),
// le segment et les pastilles, puis la frise des dates (« Toutes · 12 », « Aujourd'hui · 1 », « Dim. 1 nov. · 2 »…) qui
// remplace le tri et la légende ; les épingles disent la date en clair, les groupes « 2 ÉVÉNEMENTS ». Toucher une date
// ne garde que ses épingles et montre la fiche ; toucher une épingle montre sa fiche (les cartes d'événement de la
// liste, inchangées). Côté Pros, les épingles gardent le nom du pro. Pas d'événement passé (lot R1). La bascule
// « Liste | Carte » est posée par l'Explorer, la même dans les deux vues.
import { archivoAt, Icon, TAB_BAR_SPACE, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  dateStrip,
  dayKey,
  type EventCard,
  explorerV2Labels as L,
  notOver,
  type ProActivity,
  type ProCard,
  explorerR2Labels as R,
} from "@orasso/shared";
import { type ReactNode, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/lib/api";
import { nowMs } from "@/lib/clock";
import { prefetchEvent } from "@/lib/eventPreview";
import { EventCardV2 } from "./EventCardV2";
import { useOpenEvent } from "./EventsSegment";
import { ExplorerMap } from "./ExplorerMap";
import { eventPins, eventPinsData, proPins, proPinsData } from "./mapPins";
import { ProCardR2 } from "./ProsSegment";
import {
  type EventFilters,
  type EventSort,
  type ExplorerPlace,
  eventQuery,
  type ProSortValue,
  proQuery,
} from "./queries";
import type { ExplorerPosition } from "./useExplorerPosition";
import { usePaged } from "./usePaged";

const { space2, space3, space4 } = tokens.spacing;
/** Hauteur de la bascule « Liste | Carte » flottante (38 + 2 × 4). */
const TOGGLE_H = 46;

/** La frise des dates (`.frise` / `.fz`). */
function DateStrip({
  days,
  total,
  value,
  onChange,
}: {
  days: { key: string; label: string; count: number }[];
  total: number;
  value: string;
  onChange: (key: string) => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const item = (key: string, label: string, n: number) => {
    const on = key === value;
    return (
      <Pressable
        key={key}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        aria-selected={on}
        onPress={() => onChange(key)}
        style={[
          styles.fz,
          { backgroundColor: on ? c.ink : c.surface, borderColor: c.cardLine, boxShadow: t.shadow.shadowCard },
        ]}
        testID={`map-day-${key}`}
      >
        <Text variant="caption" color={on ? c.ground : c.ink} style={styles.fzLabel}>
          {label}
        </Text>
        <Text variant="caption" color={on ? c.ground : c.inkMuted} style={[styles.fzCount, on && styles.dim]}>
          {R.eventsCount(n)}
        </Text>
      </Pressable>
    );
  };
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.friseOut}
      contentContainerStyle={styles.frise}
      accessibilityRole="tablist"
      accessibilityLabel={R.dates}
      testID="map-dates"
    >
      {item("all", R.allDates, total)}
      {days.map((d) => item(d.key, d.label, d.count))}
    </ScrollView>
  );
}

/** Les morceaux posés par-dessus la carte : l'en-tête, « Me localiser », la fiche touchée, un message. */
function Overlay({
  header,
  strip,
  picked,
  notice,
  onLocate,
}: {
  header: ReactNode;
  strip?: ReactNode;
  picked: ReactNode;
  notice: string | null;
  onLocate: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [top, setTop] = useState(0);
  const bottom = TAB_BAR_SPACE + insets.bottom + space4 + TOGGLE_H + space2;
  return (
    <>
      <View
        style={[styles.top, { backgroundColor: c.ground }]}
        onLayout={(e) => setTop(e.nativeEvent.layout.height)}
        testID="map-head"
      >
        {header}
        {strip}
      </View>
      <View style={[styles.side, { top: top + space2 }]} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={R.mapLocate}
          onPress={onLocate}
          style={[styles.ctl, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}
          testID="map-locate"
        >
          <Icon name="place" size={20} color={c.ink} />
        </Pressable>
      </View>
      {notice ? (
        <View style={[styles.notice, { top: top + space2, backgroundColor: c.ground }]} testID="map-notice">
          <Text variant="caption" color={c.inkMuted}>
            {notice}
          </Text>
        </View>
      ) : null}
      {picked ? (
        <View style={[styles.peek, { bottom, maxHeight: height * 0.44 }]} testID="map-picked">
          <ScrollView contentContainerStyle={styles.peekList}>{picked}</ScrollView>
        </View>
      ) : null}
    </>
  );
}

export function EventsMapView({
  header,
  q,
  filters,
  position,
  sort,
  place,
  settled,
}: {
  header: ReactNode;
  q: string;
  filters: EventFilters;
  position: ExplorerPosition;
  sort: EventSort;
  place: ExplorerPlace;
  settled: boolean;
}) {
  const { t } = useTheme();
  const open = useOpenEvent();
  const ready = position.status !== "checking" && position.status !== "asking";
  const list = usePaged(
    (cursor) =>
      api.exploreEvents(eventQuery(q, filters, position.position, "map", new Date(nowMs()), cursor, sort, place)),
    [q, filters, position.position, sort, place],
    q ? 300 : 0,
    ready && settled,
  );
  const now = new Date(nowMs());
  const items = notOver(list.items ?? [], now);
  const [day, setDay] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const itemsKey = eventPinsData(items);
  // biome-ignore lint/correctness/useExhaustiveDependencies: la frise suit les données affichées
  const days = useMemo(() => dateStrip(items, now), [itemsKey]);
  const shown = day === "all" ? items : items.filter((e) => dayKey(e.startsAt) === day);
  // Relecture du lot R1 : les épingles suivent les données (coordonnées, date corrigées), pas seulement les identifiants.
  const shownKey = eventPinsData(shown);
  // biome-ignore lint/correctness/useExhaustiveDependencies: recalculées quand les données affichées changent
  const pins = useMemo(() => eventPins(shown, now), [shownKey]);
  const picked: EventCard[] = shown.filter((e) => selected.includes(e.id));
  const pickDay = (key: string) => {
    setDay(key);
    const first = key === "all" ? null : items.find((e) => dayKey(e.startsAt) === key && e.lat !== null);
    setSelected(first ? [first.id] : []);
  };
  return (
    <View style={[styles.fill, { backgroundColor: t.color.mapSea }]} testID="map-screen">
      {list.items ? (
        <ExplorerMap
          fill
          reveal={false}
          pins={pins}
          me={position.position}
          selectedId={selected.length === 1 ? selected[0] : null}
          onSelect={(p) => setSelected([p.id])}
          onSelectGroup={(group) => setSelected(group.map((p) => p.id))}
        />
      ) : null}
      <Overlay
        header={header}
        strip={<DateStrip days={days} total={items.length} value={day} onChange={pickDay} />}
        onLocate={() => void position.request()}
        notice={list.error ? list.error : list.items === null ? L.loading : pins.length === 0 ? L.emptyTitle : null}
        picked={
          picked.length
            ? picked.map((e) => (
                <View key={e.id} style={[styles.peekCard, { boxShadow: t.shadow.shadowPoster }]}>
                  <EventCardV2 event={e} portrait onPressIn={() => prefetchEvent(e.slug)} onPress={(r) => open(e, r)} />
                </View>
              ))
            : null
        }
      />
    </View>
  );
}

export function ProsMapView({
  header,
  q,
  job,
  sort,
  position,
  place,
  gradeLabel,
  settled,
}: {
  header: ReactNode;
  q: string;
  job: ProActivity | "";
  sort: ProSortValue;
  position: ExplorerPosition;
  place: ExplorerPlace;
  gradeLabel: string | null;
  settled: boolean;
}) {
  const { t } = useTheme();
  const ready = position.status !== "checking" && position.status !== "asking";
  const list = usePaged(
    (cursor) => api.explorePros(proQuery(q, job, sort, position.position, "map", cursor, place)),
    [q, job, sort, position.position, place],
    q ? 300 : 0,
    ready && settled,
  );
  const items: ProCard[] = list.items ?? [];
  const [selected, setSelected] = useState<string[]>([]);
  const dataKey = proPinsData(items);
  // biome-ignore lint/correctness/useExhaustiveDependencies: recalculées quand les données affichées changent
  const pins = useMemo(() => proPins(items), [dataKey]);
  const picked = items.filter((p) => selected.includes(p.slug));
  return (
    <View style={[styles.fill, { backgroundColor: t.color.mapSea }]} testID="map-screen">
      {list.items ? (
        <ExplorerMap
          fill
          reveal={false}
          pins={pins}
          me={position.position}
          selectedId={selected.length === 1 ? selected[0] : null}
          onSelect={(p) => setSelected([p.id])}
          onSelectGroup={(group) => setSelected(group.map((p) => p.id))}
        />
      ) : null}
      <Overlay
        header={header}
        onLocate={() => void position.request()}
        notice={list.error ? list.error : list.items === null ? L.loading : pins.length === 0 ? L.emptyTitle : null}
        picked={
          picked.length
            ? picked.map((p) => (
                <View key={p.slug} style={[styles.peekCard, { boxShadow: t.shadow.shadowPoster }]}>
                  <ProCardR2 pro={p} gradeLabel={gradeLabel} />
                </View>
              ))
            : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  dim: { opacity: 0.72 },
  top: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: space4,
    paddingTop: space3,
    paddingBottom: space2,
    gap: 6,
    zIndex: 5,
  },
  friseOut: { marginHorizontal: -space4, flexGrow: 0 },
  frise: { flexDirection: "row", gap: 6, paddingHorizontal: space4, paddingTop: 2, paddingBottom: 4 },
  fz: { paddingVertical: 6, paddingHorizontal: 11, borderRadius: 12, borderWidth: 1, gap: 1 },
  fzLabel: { fontSize: 13, lineHeight: 15, fontFamily: archivoAt(100, 850) },
  fzCount: { fontSize: 11, lineHeight: 13 },
  side: { position: "absolute", right: 12, zIndex: 5, gap: 8 },
  ctl: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  notice: { position: "absolute", left: 12, zIndex: 5, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  peek: { position: "absolute", left: 12, right: 12, zIndex: 6 },
  peekList: { gap: 8 },
  peekCard: { borderRadius: 20 },
});
