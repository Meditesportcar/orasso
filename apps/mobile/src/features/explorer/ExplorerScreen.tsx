// Explorer v2 (lot 44, prototype DA v2 `s-explore`, validé par Damien le 19/10/2026 ; écran partagé par les onglets
// Explorer de l'exposant et du visiteur, lot 40). Un en-tête de deux lignes : la recherche et l'état de la position ;
// les segments Événements · Pros · Personnes et crews, « Filtres » replié et la bascule Carte. Position demandée à la
// première ouverture ; refusée, petite icône rouge et repli sur le département favori. Par défaut tout, du plus proche
// au plus loin. La recherche de premier niveau (`app/recherche.tsx`) renvoie ici par « Voir tout » (segment, texte).
// Lot C2a (artefact DA v2 `s-explore`) : pas de grand titre ; en-tête `.exhead` (champ de 48 px rayon 14 avec
// « Ma position » dedans, puis la rangée de puces Événements · Pros · Personnes et crews · Filtres · Carte) ;
// « Personnes et crews » ouvre la feuille `sh-people` ; « Carte » ouvre la carte en écran plein (`s-map`, flux) ;
// la demande de position est la carte crème `.locask` (phrase en casse normale).
import { Chip, ChipRow, Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { eventFormatLabels, eventFormats, explorerLabels, explorerV2Labels as L } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { type ReactNode, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";

import { CrewSearch } from "@/features/crews/CrewSearch";
import { EventsSegment } from "@/features/explorer/EventsSegment";
import { ProsSegment } from "@/features/explorer/ProsSegment";
import { PeopleSearch } from "@/features/social/PeopleSearch";
import { SmallButton } from "@/features/sorties/bits";
import { useSession } from "@/lib/session";
import { AppSheet } from "@/ui/AppSheet";
import { TabScreen } from "@/ui/Screens";
import { activeFilters, type EventFilters, emptyEventFilters, type When } from "./queries";
import { type ExplorerPosition, useExplorerPosition } from "./useExplorerPosition";

const { space1, space2, space3 } = tokens.spacing;

type Segment = "evenements" | "pros";
const SEGMENTS: Segment[] = ["evenements", "pros"];
const WHEN: { id: When; label: string }[] = [
  { id: "all", label: L.whenAll },
  { id: "weekend", label: L.whenWeekend },
  { id: "month", label: L.whenMonth },
];

export function ExplorerScreen() {
  const params = useLocalSearchParams<{ segment?: string; q?: string }>();
  const fromParams = (SEGMENTS as string[]).includes(params.segment ?? "") ? (params.segment as Segment) : "evenements";
  const router = useRouter();
  const [segment, setSegment] = useState<Segment>(fromParams);
  // « Voir tout » d'une recherche de personnes : la feuille s'ouvre directement.
  const [people, setPeople] = useState(params.segment === "personnes");
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
    if (params.segment === "personnes") setPeople(true);
    if (typeof params.q === "string") setQ(params.q);
  }, [fromParams, params.segment, params.q]);

  const count = activeFilters(filters);
  const chip = (
    label: string,
    on: boolean,
    onPress: () => void,
    testID?: string,
    a11y: "tab" | "toggle" | "button" = "tab",
  ) => (
    <View testID={testID}>
      <Chip accessibilityRole={a11y} selected={on} onPress={onPress}>
        {label}
      </Chip>
    </View>
  );
  return (
    <TabScreen
      overlays={
        <AppSheet visible={people} onClose={() => setPeople(false)} accessibilityLabel={explorerLabels.segmentPeople}>
          <SheetHead title={explorerLabels.segmentPeople} onClose={() => setPeople(false)} />
          <PeopleSearch
            key={`s|${q}`}
            initialQ={q}
            renderCrews={(criteria) => <CrewSearch q={criteria.q} department={criteria.department} />}
          />
        </AppSheet>
      }
    >
      <View style={styles.head} testID="explorer-head">
        <SearchLine q={q} onChange={setQ} position={position} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.exrow}>
          <View style={styles.exrow} accessibilityRole="tablist">
            {chip(explorerLabels.segmentEvents, segment === "evenements", () => setSegment("evenements"))}
            {chip(explorerLabels.segmentPros, segment === "pros", () => setSegment("pros"))}
          </View>
          {chip(explorerLabels.segmentPeople, people, () => setPeople(true), "people-open", "button")}
          {segment === "evenements"
            ? chip(
                count > 0 ? `${L.filters} · ${count}` : L.filters,
                filtersOpen || count > 0,
                () => setFiltersOpen((o) => !o),
                "filters-toggle",
                "toggle",
              )
            : null}
          {chip(
            view === "map" ? L.list : L.map,
            view === "map",
            () =>
              // La carte s'ouvre en écran plein (`s-map`, flux sans barre) ; sur le web de recette, la carte reste en place.
              mapFullScreen
                ? router.push({ pathname: "/carte", params: { segment, q } })
                : setView((v) => (v === "map" ? "list" : "map")),
            "map-toggle",
            "button",
          )}
        </ScrollView>
        {segment === "evenements" && filtersOpen ? (
          <FiltersPanel value={filters} onChange={setFilters} signedIn={Boolean(me)} />
        ) : null}
      </View>
      {position.status === "ask" ? <AskPosition position={position} dept={dept} /> : null}
      {segment === "evenements" ? (
        <EventsSegment q={q} filters={filters} position={position} dept={dept} view={view} />
      ) : null}
      {segment === "pros" ? <ProsSegment q={q} position={position} dept={dept} view={view} /> : null}
    </TabScreen>
  );
}

/** Carte en écran plein : partout (le web de recette compris). */
const mapFullScreen = true;

/** En-tête de feuille `.sh-h` : titre italique 18 px, ✕ sur fond de carte. */
export function SheetHead({ title, onClose }: { title: string; onClose: () => void }) {
  const { t } = useTheme();
  return (
    <View style={styles.shH}>
      <Text variant="posterM" color={t.color.ink} accessibilityRole="header" style={styles.shTitle}>
        {title}
      </Text>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Fermer"
        style={[styles.closex, { backgroundColor: t.color.surface }]}
        testID="sheet-close"
      >
        <Icon name="close" size={20} color={t.color.ink} />
      </Pressable>
    </View>
  );
}

/** Ligne 1 : la recherche, et l'état de la position à droite (moutarde activée, rouge refusée, sinon le département). */
function SearchLine({
  q,
  onChange,
  position,
}: {
  q: string;
  onChange: (q: string) => void;
  position: ExplorerPosition;
}) {
  const { t } = useTheme();
  const c = t.color;
  const on = position.status === "on";
  const denied = position.status === "denied";
  // `.gpsbtn` : icône moutarde activée, rouge refusée ; libellé « Ma position » (rouge s'il est refusé).
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
        style={[styles.gps, { backgroundColor: c.surfaceRaised }]}
        testID="gps-button"
        accessibilityState={{ checked: on }}
      >
        <Icon name="place" size={16} color={tint} />
        <Text variant="bodyStrong" color={denied ? c.winText : c.ink} style={styles.gpsText}>
          {L.gpsOn}
        </Text>
      </Pressable>
    </View>
  );
}

/** « Trie par distance depuis là où tu es » : Activer / Plus tard. */
function AskPosition({ position, dept }: { position: ExplorerPosition; dept: string | null }) {
  const { t } = useTheme();
  return (
    <View style={[styles.ask, { backgroundColor: t.color.poster }]} testID="position-ask">
      <View style={[styles.askIcon, { backgroundColor: t.color.accent }]}>
        <Icon name="place" size={26} color={t.color.accentInk} />
      </View>
      <View style={styles.askBody}>
        <Text variant="bodyStrong" color={t.color.posterInk} style={styles.askTitle}>
          {L.askTitle}
        </Text>
        <Text variant="caption" color={t.color.posterMuted} style={styles.askText}>
          {L.askText(dept)}
        </Text>
        <View style={styles.askActions}>
          <SmallButton kind="p" icon="place" onPress={() => void position.request()} testID="position-enable">
            {L.askEnable}
          </SmallButton>
          <SmallButton icon="close" onPress={position.later} onPoster>
            {L.askLater}
          </SmallButton>
        </View>
      </View>
    </View>
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
  // `.exsearch` : 48 px, rayon 14, fond de champ, liseré 1,5 px ; `.gpsbtn` 36 px rayon 10 sur `--card-2`.
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: space2,
    height: 48,
    paddingLeft: space3,
    paddingRight: 6,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  input: { flex: 1, minWidth: 0, minHeight: 44, fontSize: 15 },
  gps: { flexDirection: "row", alignItems: "center", gap: 5, height: 36, paddingHorizontal: 10, borderRadius: 10 },
  gpsText: { fontSize: 12, lineHeight: 15, fontWeight: "800" },
  exrow: { flexDirection: "row", alignItems: "center", gap: 6 },
  // `.locask` : carte crème, pastille moutarde 44 px rayon 14, phrase 13,5 px.
  ask: { flexDirection: "row", gap: space3, padding: 14, borderRadius: 18 },
  askIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  askBody: { flex: 1, minWidth: 0 },
  askTitle: { fontWeight: "800" },
  askText: { fontSize: 13.5, lineHeight: 19, marginTop: 3, marginBottom: 10 },
  askActions: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  shH: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  shTitle: { flex: 1, fontSize: 18, lineHeight: 19 },
  closex: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  filters: { gap: space2 },
  group: { gap: space1 },
});
