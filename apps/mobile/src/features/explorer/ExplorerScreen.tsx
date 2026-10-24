// Explorer (lot 44, prototype DA v2 `s-explore` ; écran partagé par les onglets Explorer de l'exposant et du visiteur,
// lot 40). La recherche de premier niveau (`app/recherche.tsx`) renvoie ici par « Voir tout » (segment, texte).
// Lot R2 (maquette « Explorer R2 », validée par Damien le 24/10 : « Parfait ! Juste l'entête, on garde toujours
// Orasso ») : un onglet, mode A, la bande ORASSO toujours en haut ; dessous, la même structure dans les trois segments :
// le segment (Événements, Pros, Personnes et crews), la recherche du segment actif, puis une ligne de trois pastilles
// qui montrent leur valeur (contour : tes réglages habituels ; encre : une valeur choisie ; nombre moutarde : les
// filtres actifs). Une seule feuille « Où chercher ? » (Autour de moi et sa distance, Mon coin, Ailleurs, Partout en
// France) remplace « Ma position », « Autour de… » et « Revenir à mon coin » ; le lieu est commun aux Événements et aux
// Pros. Tri par date (événements), par distance (pros). Les Pros par métier, un seul à la fois. Personnes et crews :
// aucun annuaire (suggestions publiques, recherche). La carte vit dans l'onglet, avec la frise des dates.
// Lot R1 : tout le choix est gardé pour le compte (`explorerChoice.ts`), jamais une position.
import { Icon, type IconName, TAB_BAR_SPACE, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type ExplorerWhere,
  effectiveWhere,
  gradeLabels,
  grades,
  habitualWhere,
  explorerV2Labels as L,
  type ProActivity,
  type ProActivityCounts,
  proActivityLabels,
  explorerR2Labels as R,
  sameWhere,
} from "@orasso/shared";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EventsSegment } from "@/features/explorer/EventsSegment";
import { EventsMapView, ProsMapView } from "@/features/explorer/ExplorerMapView";
import { PeopleSegment } from "@/features/explorer/PeopleSegment";
import { ProsSegment } from "@/features/explorer/ProsSegment";
import { SmallButton } from "@/features/sorties/bits";
import { api } from "@/lib/api";
import { nowMs } from "@/lib/clock";
import { cacheGetJson, cacheScope, cacheSetJson, kvDel } from "@/lib/kv";
import { usePreferences } from "@/lib/preferences";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { TabStage } from "@/ui/Screens";
import { ExSearch, Pill, PillRow, SegmentBar } from "./ExplorerHead";
import {
  type ChoiceOption,
  ChoiceSheet,
  deptLong,
  EventFiltersSheet,
  type FiltersDraft,
  JobSheet,
  PeopleFiltersSheet,
  PeopleWhereSheet,
  WhereSheet,
} from "./ExplorerSheets";
import {
  CHOICE_KEY,
  defaultChoice,
  EXPLORER_SEGMENTS,
  type ExplorerSegment,
  type PeopleFilters,
  type PeopleShow,
  type PeopleWhere,
  type ProSort,
  readChoice,
  storeChoice,
} from "./explorerChoice";
import {
  activeFilters,
  EVENT_SORTS,
  type EventFilters,
  type EventSort,
  type ExplorerPlace,
  eventQuery,
  preferredFormats,
  proQuery,
  SORT_KEY,
} from "./queries";
import { type ExplorerPosition, useExplorerPosition } from "./useExplorerPosition";

const { space2, space3, space4 } = tokens.spacing;

type Sheet = "where" | "sort" | "filters" | "job" | "proSort" | "peopleWhere" | "show" | "peopleFilters" | null;

const SORT_ICONS: Record<EventSort, IconName> = {
  date: "calendar",
  distance: "place",
  recent: "spark",
  seats: "vehicle",
};
const EVENT_SORT_OPTIONS: ChoiceOption<EventSort>[] = EVENT_SORTS.map((s) => ({
  id: s,
  icon: SORT_ICONS[s],
  label: L.sorts[s]?.label ?? s,
  hint: L.sorts[s]?.hint,
}));
const PRO_SORT_OPTIONS: ChoiceOption<ProSort>[] = [
  { id: "distance", icon: "place", label: R.proSorts.distance?.label ?? "", hint: R.proSorts.distance?.hint },
  { id: "name", icon: "list", label: R.proSorts.name?.label ?? "", hint: R.proSorts.name?.hint },
];
const SHOW_OPTIONS: ChoiceOption<PeopleShow>[] = [
  { id: "all", icon: "explore", label: R.showAll },
  { id: "people", icon: "profile", label: R.showPeople },
  { id: "crews", icon: "staff", label: R.showCrews },
];
const SHOW_LABEL: Record<PeopleShow, string> = { all: R.showAll, people: R.showPeople, crews: R.showCrews };

/** Le lieu, en clair, pour la ligne de la liste. */
function placeLineOf(where: ExplorerWhere, coin: readonly string[]): string {
  if (where.kind === "me") return R.lineMe(where.km);
  if (where.kind === "mine") return coin.map(deptLong).join(", ");
  if (where.kind === "dept") return deptLong(where.code);
  return R.lineAll;
}

/** Le lieu, sur sa pastille. */
function wherePill(where: ExplorerWhere, coin: readonly string[]): string {
  if (where.kind === "me") return R.pillMe(where.km);
  if (where.kind === "mine") return R.pillMine(coin);
  if (where.kind === "dept") return deptLong(where.code);
  return R.pillAll;
}

const whereId = (w: ExplorerWhere) => (w.kind === "me" ? `me${w.km}` : w.kind === "dept" ? `d${w.code}` : w.kind);

export function ExplorerScreen() {
  const params = useLocalSearchParams<{ segment?: string; q?: string }>();
  const fromParams = (EXPLORER_SEGMENTS as readonly string[]).includes(params.segment ?? "")
    ? (params.segment as ExplorerSegment)
    : null;
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const me = useSession().me;
  const [segment, setSegment] = useState<ExplorerSegment>(fromParams ?? "evenements");
  // La recherche dépend du segment (son texte d'aide aussi) : un texte par segment.
  const [qs, setQs] = useState<Record<ExplorerSegment, string>>(() => ({
    evenements: "",
    pros: "",
    personnes: "",
    ...(fromParams && typeof params.q === "string" ? { [fromParams]: params.q } : {}),
  }));
  const q = qs[segment];
  const setQ = (text: string) => setQs((all) => ({ ...all, [segment]: text }));
  const [view, setView] = useState<"list" | "map">("list");
  const [sheet, setSheet] = useState<Sheet>(null);

  const [where, setWhere] = useState<ExplorerWhere | null>(defaultChoice.where);
  const [sort, setSort] = useState<EventSort>(defaultChoice.sort);
  const [filters, setFilters] = useState<Omit<EventFilters, "formats">>(defaultChoice.filters);
  const [prefFormatsOn, setPrefFormatsOn] = useState(defaultChoice.prefFormatsOn);
  const [job, setJob] = useState<ProActivity | "">(defaultChoice.job);
  const [proSort, setProSort] = useState<ProSort>(defaultChoice.proSort);
  const [peopleWhere, setPeopleWhere] = useState<PeopleWhere>(defaultChoice.peopleWhere);
  const [show, setShow] = useState<PeopleShow>(defaultChoice.show);
  const [people, setPeople] = useState<PeopleFilters>(defaultChoice.people);

  // « Tes préférences » (lot M6) : le point de départ de l'Explorer, jamais une limite. Ce qu'on choisit ici ne les change pas.
  const { preferences: prefs, loading: prefsLoading, error: prefsError } = usePreferences();
  const prefsRead = !me || prefs !== null || prefsError !== null || !prefsLoading;
  const coin = prefs?.departments.length ? prefs.departments : (me?.profile.departments ?? []);
  const coinKey = coin.join(",");
  const position = useExplorerPosition();
  const positionOn = position.status === "on" && position.position !== null;

  // Lot R1 : le choix gardé, relu pour le compte connecté. La liste attend cette lecture.
  const meId = me?.user.id ?? null;
  const [choiceRead, setChoiceRead] = useState(false);
  const choiceScope = useRef<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: relu à l'ouverture et quand le compte change
  useEffect(() => {
    let alive = true;
    setChoiceRead(false);
    const scope = cacheScope();
    (async () => {
      const saved = readChoice(await cacheGetJson<unknown>(CHOICE_KEY));
      if (!alive) return;
      // Avant le lot R1, seul le tri était gardé (sur l'appareil, sans compte) : il s'efface.
      if (!saved) void kvDel(SORT_KEY);
      const choice = saved ?? defaultChoice;
      // « Voir tout » d'une recherche arrive avec son segment : il l'emporte.
      if (!fromParams) setSegment(choice.segment);
      setWhere(choice.where);
      setSort(choice.sort);
      setFilters(choice.filters);
      setPrefFormatsOn(choice.prefFormatsOn);
      setJob(choice.job);
      setProSort(choice.proSort);
      setPeopleWhere(choice.peopleWhere);
      setShow(choice.show);
      setPeople(choice.people);
    })()
      .catch(() => undefined)
      .finally(() => {
        if (!alive) return;
        choiceScope.current = scope;
        setChoiceRead(true);
      });
    return () => {
      alive = false;
    };
  }, [meId]);
  useEffect(() => {
    if (!choiceRead || !choiceScope.current) return;
    void cacheSetJson(
      CHOICE_KEY,
      storeChoice({ segment, where, sort, filters, prefFormatsOn, job, proSort, peopleWhere, show, people }),
      choiceScope.current,
    );
  }, [choiceRead, segment, where, sort, filters, prefFormatsOn, job, proSort, peopleWhere, show, people]);

  // « Voir tout » d'une recherche : on arrive avec un segment et un texte.
  useEffect(() => {
    if (!fromParams) return;
    setSegment(fromParams);
    setView("list");
    if (typeof params.q === "string") setQs((all) => ({ ...all, [fromParams]: params.q as string }));
  }, [fromParams, params.q]);

  // Le lieu : le choix fait, sinon les réglages habituels ; une recherche par texte cherche partout tant que le lieu n'a
  // pas été choisi (lot R1).
  const searching = q.trim().length > 0;
  const habitual = habitualWhere(prefs ? { radiusKm: prefs.radiusKm } : null, positionOn, coin.length > 0);
  const effective = effectiveWhere(where, habitual, { positionOn, hasCoin: coin.length > 0, searching });
  const effectiveId = whereId(effective);
  // biome-ignore lint/correctness/useExhaustiveDependencies: le lieu change quand son identifiant change
  const place: ExplorerPlace = useMemo(() => ({ where: effective, coin }), [effectiveId, coinKey]);
  const whereSet = where !== null && !sameWhere(effective, habitual);
  const placeLine = placeLineOf(effective, coin);

  // Les types des préférences s'appliquent tant qu'aucun format n'est choisi à la main ; jamais à une recherche.
  const prefTypes = preferredFormats(prefs?.eventFormats);
  const prefFormats = prefFormatsOn && !filters.format && !searching ? prefTypes : [];
  const prefFormatsKey = prefFormats.join(",");
  const listFilters = useMemo<EventFilters>(
    () => ({ ...filters, formats: prefFormatsKey ? (prefFormatsKey.split(",") as EventFilters["formats"]) : [] }),
    [filters, prefFormatsKey],
  );
  const filterCount = activeFilters(listFilters) + (prefFormats.length ? 1 : 0);
  const settled = choiceRead && prefsRead;
  const grade = me ? me.profile.grade : null;
  const gradeLabel = grade ? gradeLabels[grade] : null;

  // Les nombres des feuilles (« Voir les 12 événements », « Quel métier ? ») : lus pour le brouillon, première page seule.
  const eventsCount = (w: ExplorerWhere, f: EventFilters) => {
    if (w.kind === "me" && !positionOn) return Promise.resolve(null);
    const query = eventQuery(q, f, position.position, "list", new Date(nowMs()), undefined, sort, { where: w, coin });
    return api.exploreEvents({ ...query, limit: 1 }).then((p) => p.total ?? null);
  };
  const prosCount = (w: ExplorerWhere) => {
    if (w.kind === "me" && !positionOn) return Promise.resolve(null);
    const query = proQuery(q, job, proSort, position.position, "list", undefined, { where: w, coin });
    return api.explorePros({ ...query, limit: 1 }).then((p) => p.total ?? null);
  };
  const filtersFor = (d: FiltersDraft): EventFilters => ({
    ...d.filters,
    formats: d.prefOn && !d.filters.format && !searching ? prefTypes : [],
  });
  const jobCounts = useApi<ProActivityCounts | null>(
    () =>
      sheet === "job"
        ? api.proActivityCounts(proQuery(q, "", proSort, position.position, "list", undefined, place))
        : Promise.resolve(null),
    [sheet === "job", place, q, position.position],
  );
  const categories = useApi(() => api.categories(), [], { cacheKey: "ref.categories" });

  const close = () => setSheet(null);
  const applyWhere = (next: ExplorerWhere) => {
    // Revenu sur ses réglages habituels : rien de choisi (la pastille repasse en contour).
    setWhere(sameWhere(next, habitual) ? null : next);
    if (next.kind !== "me" && position.status === "on") position.clear();
    close();
  };
  const enableMyPosition = () => {
    void position.request();
  };

  const mapOk = segment !== "personnes";
  const inMap = view === "map" && mapOk;
  const pills =
    segment === "evenements" ? (
      <>
        <Pill
          icon="place"
          value={wherePill(effective, coin)}
          set={whereSet}
          onPress={() => setSheet("where")}
          testID="around-open"
        />
        {inMap ? null : (
          <Pill
            icon="sort"
            value={R.sortPill[filters.affinity ? "date" : sort] ?? sort}
            set={sort !== defaultChoice.sort}
            onPress={() => setSheet("sort")}
            testID="sort-open"
          />
        )}
        <Pill
          icon="filter"
          value={R.filters}
          count={filterCount || undefined}
          set={activeFilters(listFilters) > 0 || (!prefFormatsOn && prefTypes.length > 0)}
          onPress={() => setSheet("filters")}
          testID="filters-toggle"
        />
      </>
    ) : segment === "pros" ? (
      <>
        <Pill
          icon="place"
          value={wherePill(effective, coin)}
          set={whereSet}
          onPress={() => setSheet("where")}
          testID="around-open"
        />
        <Pill
          icon="wrench"
          k={R.job}
          value={job ? proActivityLabels[job] : R.jobAll}
          set={Boolean(job)}
          onPress={() => setSheet("job")}
          testID="job-open"
        />
        {inMap ? null : (
          <Pill
            icon="sort"
            value={R.sortPill[proSort] ?? proSort}
            set={proSort !== defaultChoice.proSort}
            onPress={() => setSheet("proSort")}
            testID="pro-sort-open"
          />
        )}
      </>
    ) : (
      <>
        <Pill
          icon="place"
          value={
            peopleWhere.kind === "mine"
              ? R.pillMine(coin)
              : peopleWhere.kind === "dept"
                ? deptLong(peopleWhere.code)
                : R.pillAll
          }
          set={peopleWhere.kind !== "mine"}
          onPress={() => setSheet("peopleWhere")}
          testID="people-where-open"
        />
        <Pill
          icon="profile"
          k={R.show}
          value={SHOW_LABEL[show]}
          set={show !== "all"}
          onPress={() => setSheet("show")}
          testID="show-open"
        />
        <Pill
          icon="filter"
          value={R.filters}
          count={(people.categoryId ? 1 : 0) + (people.grade ? 1 : 0) || undefined}
          set={Boolean(people.categoryId || people.grade)}
          onPress={() => setSheet("peopleFilters")}
          testID="people-filters"
        />
      </>
    );
  const header = (
    <View style={styles.head} testID="explorer-head">
      <SegmentBar
        value={segment}
        onChange={(s) => {
          setSegment(s);
          if (s === "personnes") setView("list");
        }}
      />
      {inMap ? null : (
        <ExSearch
          value={q}
          onChange={setQ}
          placeholder={segment === "evenements" ? R.searchEvents : segment === "pros" ? R.searchPros : R.searchPeople}
          testID={segment === "personnes" ? "people-q" : "events-q"}
        />
      )}
      <PillRow>{pills}</PillRow>
    </View>
  );

  const sheets = (
    <>
      {mapOk ? (
        <ListMapToggle view={inMap ? "map" : "list"} onList={() => setView("list")} onMap={() => setView("map")} />
      ) : null}
      <WhereSheet
        visible={sheet === "where"}
        onClose={close}
        value={effective}
        coin={coin}
        positionOn={positionOn}
        positionDenied={position.status === "denied"}
        onRequestPosition={enableMyPosition}
        countFor={(w) => (segment === "pros" ? prosCount(w) : eventsCount(w, listFilters))}
        seeLabel={segment === "pros" ? R.seePros : R.seeEvents}
        onApply={applyWhere}
      />
      <ChoiceSheet
        visible={sheet === "sort"}
        onClose={close}
        title={R.sortEventsSheet}
        options={EVENT_SORT_OPTIONS}
        value={sort}
        onPick={(s) => {
          setSort(s);
          close();
        }}
        hint={R.sortHint}
        testID="sort-sheet"
      />
      <ChoiceSheet
        visible={sheet === "proSort"}
        onClose={close}
        title={R.sortProsSheet}
        options={PRO_SORT_OPTIONS}
        value={proSort}
        onPick={(s) => {
          setProSort(s);
          close();
        }}
        hint={R.sortHint}
        testID="pro-sort-sheet"
      />
      <EventFiltersSheet
        visible={sheet === "filters"}
        onClose={close}
        value={{ filters: { ...filters }, prefOn: prefFormatsOn }}
        hasPrefs={prefTypes.length > 0 && !searching}
        signedIn={Boolean(me)}
        countFor={(d) => eventsCount(effective, filtersFor(d))}
        onApply={(d) => {
          const { format, when, affinity, followed } = d.filters;
          setFilters({ format, when, affinity, followed });
          setPrefFormatsOn(d.prefOn);
          close();
        }}
      />
      <JobSheet
        visible={sheet === "job"}
        onClose={close}
        value={job}
        counts={jobCounts.data ?? null}
        onPick={(next) => {
          setJob(next);
          close();
        }}
      />
      <PeopleWhereSheet
        visible={sheet === "peopleWhere"}
        onClose={close}
        value={peopleWhere}
        coin={coin}
        onApply={(next) => {
          setPeopleWhere(next);
          close();
        }}
      />
      <ChoiceSheet
        visible={sheet === "show"}
        onClose={close}
        title={R.showSheet}
        options={SHOW_OPTIONS}
        value={show}
        onPick={(s) => {
          setShow(s);
          close();
        }}
        testID="show-sheet"
      />
      <PeopleFiltersSheet
        visible={sheet === "peopleFilters"}
        onClose={close}
        value={people}
        categories={(categories.data ?? []).map((x) => ({ id: x.id, label: x.label }))}
        grades={grades.map((g) => ({ id: g, label: gradeLabels[g] }))}
        onApply={(next) => {
          setPeople({ categoryId: next.categoryId, grade: next.grade as PeopleFilters["grade"] });
          close();
        }}
      />
    </>
  );

  if (inMap) {
    return (
      <TabStage overlays={sheets}>
        {segment === "evenements" ? (
          <EventsMapView
            header={header}
            q={q}
            filters={listFilters}
            position={position}
            sort="date"
            place={place}
            settled={settled}
          />
        ) : (
          <ProsMapView
            header={header}
            q={q}
            job={job}
            sort={proSort}
            position={position}
            place={place}
            gradeLabel={gradeLabel}
            settled={settled}
          />
        )}
      </TabStage>
    );
  }

  return (
    <TabStage overlays={sheets}>
      <View style={[styles.headWrap, { backgroundColor: t.color.ground }]}>{header}</View>
      <ScrollView
        style={styles.fill}
        contentContainerStyle={[styles.body, { paddingBottom: 150 + insets.bottom }]}
        keyboardShouldPersistTaps="handled"
        testID="explorer-body"
      >
        {segment !== "personnes" && position.status === "ask" ? (
          <AskPosition position={position} dept={coin[0] ?? null} onEnable={enableMyPosition} />
        ) : null}
        {segment === "evenements" ? (
          <EventsSegment
            q={q}
            filters={listFilters}
            position={position}
            sort={sort}
            place={place}
            placeLine={placeLine}
            settled={settled}
          />
        ) : null}
        {segment === "pros" ? (
          <ProsSegment
            q={q}
            position={position}
            job={job}
            sort={proSort}
            place={place}
            placeLine={placeLine}
            grade={grade}
            settled={settled}
          />
        ) : null}
        {segment === "personnes" ? (
          <PeopleSegment q={q} where={peopleWhere} show={show} filters={people} coin={coin} />
        ) : null}
      </ScrollView>
    </TabStage>
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

/** « Trie par distance depuis là où tu es » : Activer / Plus tard. */
function AskPosition({
  position,
  dept,
  onEnable,
}: {
  position: ExplorerPosition;
  dept: string | null;
  onEnable: () => void;
}) {
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
          <SmallButton kind="p" icon="place" onPress={onEnable} testID="position-enable">
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

const styles = StyleSheet.create({
  fill: { flex: 1 },
  headWrap: { paddingHorizontal: space4, paddingTop: space3, paddingBottom: space2 },
  head: { gap: 8 },
  body: { paddingHorizontal: space4, paddingTop: space2, gap: 10 },
  // `.locask` : carte crème, pastille moutarde 44 px rayon 14, phrase 13,5 px.
  ask: { flexDirection: "row", gap: space3, padding: 14, borderRadius: 18 },
  askIcon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  askBody: { flex: 1, minWidth: 0 },
  askTitle: { fontWeight: "800" },
  askText: { fontSize: 13.5, lineHeight: 19, marginTop: 3, marginBottom: 10 },
  askActions: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  lcWrap: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 24 },
  lcfab: { flexDirection: "row", padding: 4, borderRadius: 999 },
  lcItem: { flexDirection: "row", alignItems: "center", gap: 6, height: 38, paddingHorizontal: 14, borderRadius: 999 },
  lcText: { fontSize: 12, lineHeight: 15, fontFamily: "Archivo-ExtraBold", textTransform: "uppercase" },
});
