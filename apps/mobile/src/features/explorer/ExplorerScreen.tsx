// Explorer v2 (lot 44, prototype DA v2 `s-explore`, validé par Damien le 19/10/2026 ; écran partagé par les onglets
// Explorer de l'exposant et du visiteur, lot 40). Un en-tête de deux lignes : la recherche et l'état de la position ;
// les segments Événements · Pros · Personnes et crews, « Filtres » replié et la bascule Carte. Position demandée à la
// première ouverture ; refusée, petite icône rouge et repli sur le département favori. Par défaut tout, du plus proche
// au plus loin. La recherche de premier niveau (`app/recherche.tsx`) renvoie ici par « Voir tout » (segment, texte).
// Lot C2a (artefact DA v2 `s-explore`) : pas de grand titre ; en-tête `.exhead` (champ de 48 px rayon 14 avec
// « Ma position » dedans, puis la rangée de puces Événements · Pros · Personnes et crews · Filtres · Carte) ;
// « Personnes et crews » ouvre la feuille `sh-people` ; « Carte » ouvre la carte en écran plein (`s-map`, flux) ;
// la demande de position est la carte crème `.locask` (phrase en casse normale).
// Lot M4 (maquettes 3.1 à 3.3, « parfait » pour Damien) : sous les puces, « Trier : Distance ▾ » (un vrai sélecteur,
// dans une feuille, gardé pour les prochaines visites) et « Filtres » avec le nombre de filtres actifs ; la bascule
// « Liste | Carte » flotte au-dessus de la barre d'onglets, toujours visible. Préférences du lot M6 : voir `prefsFilters`.
import {
  Chip,
  ChipRow,
  Icon,
  type IconName,
  TAB_BAR_SPACE,
  Text,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import { eventFormatLabels, eventFormats, explorerLabels, explorerV2Labels as L } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { type ReactNode, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EventsSegment } from "@/features/explorer/EventsSegment";
import { PeopleSheetBody } from "@/features/explorer/PeopleSheet";
import { ProsSegment } from "@/features/explorer/ProsSegment";
import { SmallButton } from "@/features/sorties/bits";
import { kvGet, kvSet } from "@/lib/kv";
import { useSession } from "@/lib/session";
import { AppSheet } from "@/ui/AppSheet";
import { TabScreen } from "@/ui/Screens";
import {
  activeFilters,
  EVENT_SORTS,
  type EventFilters,
  type EventSort,
  emptyEventFilters,
  emptyProFilters,
  type ProFilters,
  SORT_KEY,
  type When,
} from "./queries";
import { type ExplorerPosition, useExplorerPosition } from "./useExplorerPosition";

const { space1, space2, space3, space4 } = tokens.spacing;

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
  const [proFilters, setProFilters] = useState<ProFilters>(emptyProFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Lot M4 : la carte s'ouvre en écran plein (`/carte`) ; la liste reste la vue de cet écran.
  const view: "list" | "map" = "list";
  // Lot M4 : le tri choisi, relu au lancement et gardé pour les prochaines visites.
  const [sort, setSort] = useState<EventSort>("distance");
  const [sorting, setSorting] = useState(false);
  useEffect(() => {
    void kvGet(SORT_KEY).then((v) => {
      if (v && (EVENT_SORTS as readonly string[]).includes(v)) setSort(v as EventSort);
    });
  }, []);
  const chooseSort = (next: EventSort) => {
    setSort(next);
    setSorting(false);
    void kvSet(SORT_KEY, next);
  };
  const openMap = () =>
    // La carte s'ouvre en écran plein (`s-map`, flux sans barre) et garde les filtres de la liste (relecture du lot C2a).
    router.push({
      pathname: "/carte",
      params: { segment, q, filtres: JSON.stringify(segment === "pros" ? proFilters : filters) },
    });
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
        <>
          <ListMapToggle view="list" onList={() => undefined} onMap={openMap} />
          <AppSheet visible={people} onClose={() => setPeople(false)} accessibilityLabel={explorerLabels.segmentPeople}>
            <SheetHead title={explorerLabels.segmentPeople} onClose={() => setPeople(false)} />
            <PeopleSheetBody key={`s|${q}`} initialQ={q} />
          </AppSheet>
          <AppSheet visible={sorting} onClose={() => setSorting(false)} accessibilityLabel={L.sortSheet}>
            <SheetHead title={L.sortSheet} onClose={() => setSorting(false)} />
            <SortOptions value={sort} onChange={chooseSort} />
          </AppSheet>
        </>
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
        </ScrollView>
        {segment === "evenements" ? (
          // `.xtools` : « Trier : Distance ▾ » à gauche, « Filtres » à droite, toujours visibles.
          <View style={styles.xtools}>
            <SortButton value={sort} onPress={() => setSorting(true)} />
            <View style={styles.grow} />
            {chip(
              count > 0 ? `${L.filters} · ${count}` : L.filters,
              filtersOpen || count > 0,
              () => setFiltersOpen((o) => !o),
              "filters-toggle",
              "toggle",
            )}
          </View>
        ) : null}
        {segment === "evenements" && filtersOpen ? (
          <FiltersPanel value={filters} onChange={setFilters} signedIn={Boolean(me)} />
        ) : null}
      </View>
      {position.status === "ask" ? <AskPosition position={position} dept={dept} /> : null}
      {segment === "evenements" ? (
        <EventsSegment q={q} filters={filters} position={position} dept={dept} view={view} sort={sort} />
      ) : null}
      {segment === "pros" ? (
        <ProsSegment
          q={q}
          position={position}
          dept={dept}
          view={view}
          filters={proFilters}
          onFiltersChange={setProFilters}
          places
        />
      ) : null}
    </TabScreen>
  );
}

/** Lot M4 : « Trier : <b>Distance</b> ▾ » (`.sortbtn`), un vrai sélecteur. */
function SortButton({ value, onPress }: { value: EventSort; onPress: () => void }) {
  const { t } = useTheme();
  const c = t.color;
  const label = L.sorts[value]?.label ?? value;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${L.sortButton} : ${label}`}
      onPress={onPress}
      style={[styles.sortBtn, { backgroundColor: c.surface, borderColor: c.line }]}
      testID="sort-open"
    >
      <Icon name="list" size={16} color={c.inkMuted} />
      <Text variant="caption" color={c.inkMuted} style={styles.sortBtnText}>
        {`${L.sortButton} : `}
        <Text variant="caption" color={c.ink} style={styles.sortBtnValue}>
          {label}
        </Text>
      </Text>
      <Icon name="down" size={16} color={c.ink} />
    </Pressable>
  );
}

const SORT_ICONS: Record<EventSort, IconName> = {
  distance: "place",
  date: "calendar",
  recent: "spark",
  seats: "vehicle",
};

/** Lot M4 (maquette 3.2) : la feuille « Trier les événements », le choix s'applique tout de suite. */
function SortOptions({ value, onChange }: { value: EventSort; onChange: (s: EventSort) => void }) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View style={styles.optlist} accessibilityRole="radiogroup" testID="sort-sheet">
      {EVENT_SORTS.map((s) => {
        const on = s === value;
        return (
          <Pressable
            key={s}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            aria-checked={on}
            onPress={() => onChange(s)}
            style={[styles.opt, { backgroundColor: c.surface }, on && { borderColor: c.accent, borderWidth: 2 }]}
            testID={`sort-${s}`}
          >
            <View style={[styles.optIcon, { backgroundColor: c.surfaceSunken }]}>
              <Icon name={SORT_ICONS[s]} size={18} color={c.ink} />
            </View>
            <View style={styles.grow}>
              <Text variant="bodyStrong" color={c.ink} style={styles.optTitle}>
                {L.sorts[s]?.label}
              </Text>
              <Text variant="caption" color={c.inkMuted}>
                {L.sorts[s]?.hint}
              </Text>
            </View>
            <View style={[styles.radio, { borderColor: on ? c.accent : c.line }]}>
              {on ? <View style={[styles.radioDot, { backgroundColor: c.accent }]} /> : null}
            </View>
          </Pressable>
        );
      })}
      <Text variant="caption" color={c.inkMuted} style={styles.optHint}>
        {L.sortSheetHint}
      </Text>
    </View>
  );
}

/**
 * Lot M4 (maquettes 3.1, 3.3) : la bascule « Liste | Carte » (`.lcfab`), flottante au-dessus de la barre d'onglets,
 * toujours visible ; la même sur la carte, côté Carte.
 */
export function ListMapToggle({
  view,
  onList,
  onMap,
  bottom,
}: {
  view: "list" | "map";
  onList: () => void;
  onMap: () => void;
  /** Distance au bas de l'écran ; par défaut, au-dessus de la barre d'onglets. */
  bottom?: number;
}) {
  const { t } = useTheme();
  const c = t.color;
  const insets = useSafeAreaInsets();
  const item = (id: "list" | "map", icon: IconName, label: string, onPress: () => void) => {
    const on = view === id;
    return (
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        onPress={onPress}
        style={[styles.lcItem, on && { backgroundColor: c.barInk }]}
        testID={id === "map" ? "map-toggle" : "list-toggle"}
      >
        <Icon name={icon} size={16} color={on ? c.bar : c.barMuted} />
        <Text variant="meta" color={on ? c.bar : c.barMuted} style={styles.lcText}>
          {label}
        </Text>
      </Pressable>
    );
  };
  return (
    <View
      pointerEvents="box-none"
      style={[styles.lcWrap, { bottom: bottom ?? TAB_BAR_SPACE + insets.bottom + space4 }]}
    >
      <View
        accessibilityRole="tablist"
        style={[styles.lcfab, { backgroundColor: c.bar, boxShadow: t.shadow.shadowCard }]}
        testID="list-map-toggle"
      >
        {item("list", "list", L.listView, onList)}
        {item("map", "map", L.mapView, onMap)}
      </View>
    </View>
  );
}

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
  grow: { flex: 1, minWidth: 0 },
  xtools: { flexDirection: "row", alignItems: "center", gap: space2 },
  sortBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: space3,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  sortBtnText: { fontSize: 13, lineHeight: 16 },
  sortBtnValue: { fontSize: 13, lineHeight: 16, fontFamily: "Archivo-ExtraBold" },
  // `.optlist` / `.opt` : lignes de 12 × 14, rayon 14, pastille d'icône, rond de choix.
  optlist: { gap: 6 },
  opt: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    paddingVertical: space3,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "transparent",
  },
  optIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  optTitle: { fontSize: 14.5, lineHeight: 18, fontFamily: "Archivo-ExtraBold" },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  optHint: { marginTop: space3 },
  lcWrap: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 24 },
  lcfab: { flexDirection: "row", padding: 4, borderRadius: 999 },
  lcItem: { flexDirection: "row", alignItems: "center", gap: 6, height: 38, paddingHorizontal: 14, borderRadius: 999 },
  lcText: { fontSize: 12, lineHeight: 15, fontFamily: "Archivo-ExtraBold", textTransform: "uppercase" },
});
