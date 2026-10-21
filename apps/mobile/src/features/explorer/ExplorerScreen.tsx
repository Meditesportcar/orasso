// Explorer v2 (lot 44, prototype DA v2 `s-explore`, validé par Damien le 19/10/2026 ; écran partagé par les onglets
// Explorer de l'exposant et du visiteur, lot 40). Un en-tête de deux lignes : la recherche et l'état de la position ;
// les segments Événements · Pros · Personnes et crews, « Filtres » replié et la bascule Carte. Position demandée à la
// première ouverture ; refusée, petite icône rouge et repli sur le département favori. Par défaut tout, du plus proche
// au plus loin. La recherche de premier niveau (`app/recherche.tsx`) renvoie ici par « Voir tout » (segment, texte).
import { Button, Chip, ChipRow, Icon, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { eventFormatLabels, eventFormats, explorerLabels, explorerV2Labels as L } from "@orasso/shared";
import { useLocalSearchParams } from "expo-router";
import { type ReactNode, useEffect, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { CrewSearch } from "@/features/crews/CrewSearch";
import { EventsSegment } from "@/features/explorer/EventsSegment";
import { ProsSegment } from "@/features/explorer/ProsSegment";
import { PeopleSearch } from "@/features/social/PeopleSearch";
import { useSession } from "@/lib/session";
import { TabScreen } from "@/ui/Screens";
import { Segments } from "@/ui/Segments";
import { activeFilters, type EventFilters, emptyEventFilters, type When } from "./queries";
import { type ExplorerPosition, useExplorerPosition } from "./useExplorerPosition";

const { space1, space2, space3 } = tokens.spacing;

type Segment = "evenements" | "pros" | "personnes";
const SEGMENTS: Segment[] = ["evenements", "pros", "personnes"];
const LABELS: Record<Segment, string> = {
  evenements: explorerLabels.segmentEvents,
  pros: explorerLabels.segmentPros,
  personnes: explorerLabels.segmentPeople,
};
const WHEN: { id: When; label: string }[] = [
  { id: "all", label: L.whenAll },
  { id: "weekend", label: L.whenWeekend },
  { id: "month", label: L.whenMonth },
];

export function ExplorerScreen() {
  const params = useLocalSearchParams<{ segment?: string; q?: string }>();
  const fromParams = (SEGMENTS as string[]).includes(params.segment ?? "") ? (params.segment as Segment) : "evenements";
  const [segment, setSegment] = useState<Segment>(fromParams);
  const [q, setQ] = useState(typeof params.q === "string" ? params.q : "");
  const [filters, setFilters] = useState<EventFilters>(emptyEventFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");
  const me = useSession().me;
  const dept = me?.profile.departments[0] ?? null;
  const position = useExplorerPosition();

  // « Voir tout » d'une recherche : on arrive avec un segment et un texte.
  useEffect(() => {
    setSegment(fromParams);
    if (typeof params.q === "string") setQ(params.q);
  }, [fromParams, params.q]);

  const count = activeFilters(filters);
  return (
    <TabScreen title={explorerLabels.title}>
      <View style={styles.head} testID="explorer-head">
        <SearchLine q={q} onChange={setQ} position={position} dept={dept} />
        <ChipRow>
          <Segments items={SEGMENTS.map((id) => ({ id, label: LABELS[id] }))} value={segment} onChange={setSegment} />
          {segment === "evenements" ? (
            <Chip
              accessibilityRole="toggle"
              selected={filtersOpen || count > 0}
              onPress={() => setFiltersOpen((o) => !o)}
            >
              {count > 0 ? `${L.filters} · ${count}` : L.filters}
            </Chip>
          ) : null}
          {segment !== "personnes" ? (
            <Chip
              accessibilityRole="toggle"
              selected={view === "map"}
              onPress={() => setView((v) => (v === "map" ? "list" : "map"))}
            >
              {view === "map" ? L.list : L.map}
            </Chip>
          ) : null}
        </ChipRow>
        {segment === "evenements" && filtersOpen ? (
          <FiltersPanel value={filters} onChange={setFilters} signedIn={Boolean(me)} />
        ) : null}
      </View>
      {position.status === "ask" && segment !== "personnes" ? <AskPosition position={position} dept={dept} /> : null}
      {segment === "evenements" ? (
        <EventsSegment q={q} filters={filters} position={position} dept={dept} view={view} />
      ) : null}
      {segment === "pros" ? <ProsSegment q={q} position={position} dept={dept} view={view} /> : null}
      {segment === "personnes" ? (
        <PeopleSearch
          key={`s|${q}`}
          initialQ={q}
          renderCrews={(criteria) => <CrewSearch q={criteria.q} department={criteria.department} />}
        />
      ) : null}
    </TabScreen>
  );
}

/** Ligne 1 : la recherche, et l'état de la position à droite (moutarde activée, rouge refusée, sinon le département). */
function SearchLine({
  q,
  onChange,
  position,
  dept,
}: {
  q: string;
  onChange: (q: string) => void;
  position: ExplorerPosition;
  dept: string | null;
}) {
  const { t } = useTheme();
  const c = t.color;
  const on = position.status === "on";
  const denied = position.status === "denied";
  const tint = on ? c.accentText : denied ? c.winText : c.inkMuted;
  return (
    <View style={[styles.search, { backgroundColor: c.surfaceField, borderColor: c.line }]}>
      <Icon name="search" size={18} color={c.inkMuted} />
      <TextInput
        value={q}
        onChangeText={onChange}
        placeholder={L.searchPlaceholder}
        placeholderTextColor={c.inkFaint}
        accessibilityLabel={L.searchLabel}
        autoCapitalize="none"
        returnKeyType="search"
        style={[styles.input, { color: c.ink }]}
        testID="events-q"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          on ? L.gpsOnA11y : denied ? (position.blocked ? L.gpsBlockedA11y : L.gpsOffA11y) : L.gpsAskA11y
        }
        onPress={() => (on ? position.clear() : void position.request())}
        style={[styles.gps, { borderColor: denied ? c.winText : on ? c.accent : c.line }]}
        testID="gps-button"
        accessibilityState={{ checked: on }}
      >
        <Icon name="place" size={16} color={tint} />
        <Text variant="label" color={tint}>
          {on ? L.gpsOn : (dept ?? "—")}
        </Text>
      </Pressable>
    </View>
  );
}

/** « Trie par distance depuis là où tu es » : Activer / Plus tard. */
function AskPosition({ position, dept }: { position: ExplorerPosition; dept: string | null }) {
  const { t } = useTheme();
  return (
    <Plate style={styles.ask} testID="position-ask">
      <Icon name="place" size={28} color={t.color.accent} />
      <View style={styles.askBody}>
        <Text variant="bodyStrong" color={t.color.plateInk}>
          {L.askTitle}
        </Text>
        <Text variant="meta" color={t.color.plateMuted}>
          {L.askText(dept)}
        </Text>
        <View style={styles.askActions}>
          <Button variant="secondary" icon="place" onPress={() => void position.request()} testID="position-enable">
            {L.askEnable}
          </Button>
          <Button variant="plate" icon="close" onPress={position.later}>
            {L.askLater}
          </Button>
        </View>
      </View>
    </Plate>
  );
}

/** Filtres repliés (prototype : sous les segments) : Format, Quand, Selon mes goûts. */
// « Selon mes goûts » suppose un compte (affinités, structures suivies) : masqué sans compte.
function FiltersPanel({
  value,
  onChange,
  signedIn,
}: {
  value: EventFilters;
  onChange: (next: EventFilters) => void;
  signedIn: boolean;
}) {
  const set = <K extends keyof EventFilters>(key: K, v: EventFilters[K]) => onChange({ ...value, [key]: v });
  return (
    <View style={styles.filters} testID="explorer-filters">
      <Group label={L.groupFormat} exclusive>
        <Chip accessibilityRole="tab" selected={value.format === ""} onPress={() => set("format", "")}>
          {L.formatAll}
        </Chip>
        {eventFormats.map((f) => (
          <Chip
            accessibilityRole="tab"
            key={f}
            selected={value.format === f}
            onPress={() => set("format", value.format === f ? "" : f)}
          >
            {eventFormatLabels[f]}
          </Chip>
        ))}
      </Group>
      <Group label={L.groupWhen} exclusive>
        {WHEN.map((w) => (
          <Chip accessibilityRole="tab" key={w.id} selected={value.when === w.id} onPress={() => set("when", w.id)}>
            {w.label}
          </Chip>
        ))}
      </Group>
      {signedIn ? (
        <Group label={L.groupTaste}>
          <Chip accessibilityRole="toggle" selected={value.affinity} onPress={() => set("affinity", !value.affinity)}>
            {L.tasteAffinity}
          </Chip>
          <Chip accessibilityRole="toggle" selected={value.followed} onPress={() => set("followed", !value.followed)}>
            {L.tasteFollowed}
          </Chip>
        </Group>
      ) : null}
    </View>
  );
}

function Group({ label, children, exclusive = false }: { label: string; children: ReactNode; exclusive?: boolean }) {
  const { t } = useTheme();
  return (
    <View style={styles.group}>
      <Text variant="label" color={t.color.inkMuted}>
        {label}
      </Text>
      <ChipRow accessibilityRole={exclusive ? "tablist" : undefined} accessibilityLabel={label}>
        {children}
      </ChipRow>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { gap: space2 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: space2,
    minHeight: 48,
    paddingLeft: space3,
    paddingRight: space1,
    borderRadius: tokens.radius.radiusPill,
    borderWidth: 1.5,
  },
  input: { flex: 1, minHeight: 44, fontSize: tokens.type.body.fontSize },
  gps: {
    flexDirection: "row",
    alignItems: "center",
    gap: space1,
    minHeight: 38,
    paddingHorizontal: space2,
    borderRadius: tokens.radius.radiusPill,
    borderWidth: 1.5,
  },
  ask: { flexDirection: "row", gap: space3, padding: space3 },
  askBody: { flex: 1, gap: space1 },
  askActions: { flexDirection: "row", flexWrap: "wrap", gap: space2, marginTop: space2 },
  filters: { gap: space2 },
  group: { gap: space1 },
});
