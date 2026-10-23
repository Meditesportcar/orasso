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
// Tour 2 (décision de Damien du 23/10) : « Autour de… » à côté du tri (Mon coin, Autour de moi, Ailleurs…) et une
// distance propre à l'Explorer avec « Partout en France » ; choix temporaires, jamais enregistrés, « Revenir à mon coin ».
import {
  Chip,
  ChipRow,
  departmentChoices,
  departmentLabel,
  Icon,
  type IconName,
  TAB_BAR_SPACE,
  Text,
  TextField,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import { eventFormatLabels, eventFormats, explorerLabels, explorerV2Labels as L } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { type ReactNode, useEffect, useMemo, useState } from "react";
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
  type Around,
  activeFilters,
  EVENT_SORTS,
  type EventFilters,
  type EventSort,
  type ExplorerPlace,
  effectiveAround,
  emptyEventFilters,
  emptyProFilters,
  type ProFilters,
  RADII,
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
  // Tour 2 (relecture Opus) : la liste attend la lecture du tri enregistré (pas de première requête au mauvais tri,
  // pas de liste qui saute d'un cache à l'autre).
  const [sortRead, setSortRead] = useState(false);
  useEffect(() => {
    let alive = true;
    void kvGet(SORT_KEY)
      .then((v) => {
        if (alive && v && (EVENT_SORTS as readonly string[]).includes(v)) setSort(v as EventSort);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setSortRead(true);
      });
    return () => {
      alive = false;
    };
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
  // Tour 2 : « Autour de… » et la distance de l'Explorer. Temporaires : en mémoire de l'écran seulement (jamais le
  // profil, les préférences ni l'appareil). `null` : pas encore choisi (la position si elle est activée, sinon Mon coin).
  const [chosen, setChosen] = useState<Around | null>(null);
  const [radiusKm, setRadiusKm] = useState<number | null>(null);
  const [aroundOpen, setAroundOpen] = useState(false);
  const around = effectiveAround(chosen, position.status === "on" && position.position !== null);
  const aroundId = around.kind === "dept" ? `d${around.code}` : around.kind;
  // biome-ignore lint/correctness/useExhaustiveDependencies: le point de départ change quand son identifiant change
  const place: ExplorerPlace = useMemo(() => ({ around, radiusKm }), [aroundId, radiusKm]);
  const enableMyPosition = () => {
    setChosen({ kind: "me" });
    void position.request();
  };
  const chooseAround = (next: Around) => {
    if (next.kind === "me") {
      enableMyPosition();
      return;
    }
    setChosen(next);
    // La position ne sert plus : elle quitte la mémoire de l'écran.
    if (position.status === "on") position.clear();
  };
  const backHome = () => {
    chooseAround({ kind: "mine" });
    setRadiusKm(null);
  };
  const away = around.kind !== "mine" || radiusKm !== null;

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
          <AppSheet visible={aroundOpen} onClose={() => setAroundOpen(false)} accessibilityLabel={L.aroundSheet}>
            <SheetHead title={L.aroundSheet} onClose={() => setAroundOpen(false)} />
            <AroundOptions
              around={around}
              radiusKm={radiusKm}
              departments={me?.profile.departments ?? []}
              onAround={(next) => {
                chooseAround(next);
                setAroundOpen(false);
              }}
              onRadius={setRadiusKm}
            />
          </AppSheet>
        </>
      }
    >
      <View style={styles.head} testID="explorer-head">
        <SearchLine q={q} onChange={setQ} position={position} onEnable={enableMyPosition} />
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
            <AroundButton around={around} onPress={() => setAroundOpen(true)} />
            {/* Tour 2 : « Filtres » reste à droite, sur la même ligne ou la suivante s'il n'y a plus la place. */}
            <View style={styles.filtersEnd}>
              {chip(
                count > 0 ? `${L.filters} · ${count}` : L.filters,
                filtersOpen || count > 0,
                () => setFiltersOpen((o) => !o),
                "filters-toggle",
                "toggle",
              )}
            </View>
          </View>
        ) : null}
        {segment === "evenements" && away ? <BackHome onPress={backHome} /> : null}
        {segment === "evenements" && filtersOpen ? (
          <FiltersPanel value={filters} onChange={setFilters} signedIn={Boolean(me)} />
        ) : null}
      </View>
      {position.status === "ask" ? <AskPosition position={position} dept={dept} onEnable={enableMyPosition} /> : null}
      {segment === "evenements" ? (
        <EventsSegment
          q={q}
          filters={filters}
          position={position}
          dept={dept}
          view={view}
          sort={sort}
          settled={sortRead}
          place={place}
        />
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

/** Tour 2 : « Autour de : <b>Mon coin</b> ▾ », à côté du tri, du même style (pas de néon). */
function AroundButton({ around, onPress }: { around: Around; onPress: () => void }) {
  const { t } = useTheme();
  const c = t.color;
  const label = around.kind === "mine" ? L.aroundMine : around.kind === "me" ? L.aroundMe : L.aroundDept(around.code);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${L.aroundButton} : ${label}`}
      onPress={onPress}
      style={[styles.sortBtn, { backgroundColor: c.surface, borderColor: c.line }]}
      testID="around-open"
    >
      <Icon name="place" size={16} color={c.inkMuted} />
      <Text variant="caption" color={c.ink} style={styles.sortBtnValue}>
        {label}
      </Text>
      <Icon name="down" size={16} color={c.ink} />
    </Pressable>
  );
}

/** Tour 2 : « Revenir à mon coin », un lien (le point de départ et la distance reprennent leurs valeurs). */
function BackHome({ onPress }: { onPress: () => void }) {
  const { t } = useTheme();
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={styles.backHome} testID="around-back">
      <Icon name="back" size={14} color={t.color.accentText} />
      <Text variant="caption" color={t.color.accentText} style={styles.backHomeText}>
        {L.backHome}
      </Text>
    </Pressable>
  );
}

/** Tour 2 : la feuille « Autour de… » : trois points de départ, puis la distance (ou partout en France). */
function AroundOptions({
  around,
  radiusKm,
  departments,
  onAround,
  onRadius,
}: {
  around: Around;
  radiusKm: number | null;
  departments: readonly string[];
  onAround: (next: Around) => void;
  onRadius: (km: number | null) => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const [elsewhere, setElsewhere] = useState(around.kind === "dept");
  const [find, setFind] = useState("");
  const matches = useMemo(() => {
    const needle = find.trim().toLowerCase();
    if (!needle) return departmentChoices;
    return departmentChoices.filter(
      (d) => d.code.toLowerCase().startsWith(needle) || d.name.toLowerCase().includes(needle),
    );
  }, [find]);
  const row = (id: string, on: boolean, icon: IconName, title: string, hint: string, onPress: () => void) => (
    <Pressable
      key={id}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      aria-checked={on}
      onPress={onPress}
      style={[styles.opt, { backgroundColor: c.surface }, on && { borderColor: c.accent, borderWidth: 2 }]}
      testID={`around-${id}`}
    >
      <View style={[styles.optIcon, { backgroundColor: c.surfaceSunken }]}>
        <Icon name={icon} size={18} color={c.ink} />
      </View>
      <View style={styles.grow}>
        <Text variant="bodyStrong" color={c.ink} style={styles.optTitle}>
          {title}
        </Text>
        <Text variant="caption" color={c.inkMuted}>
          {hint}
        </Text>
      </View>
      <View style={[styles.radio, { borderColor: on ? c.accent : c.line }]}>
        {on ? <View style={[styles.radioDot, { backgroundColor: c.accent }]} /> : null}
      </View>
    </Pressable>
  );
  return (
    <View style={styles.optlist} testID="around-sheet">
      <View style={styles.optlist} accessibilityRole="radiogroup">
        {row("mine", around.kind === "mine" && !elsewhere, "home", L.aroundMine, L.aroundMineHint(departments), () =>
          onAround({ kind: "mine" }),
        )}
        {row("me", around.kind === "me" && !elsewhere, "place", L.aroundMe, L.aroundMeHint, () =>
          onAround({ kind: "me" }),
        )}
        {row(
          "elsewhere",
          around.kind === "dept" || elsewhere,
          "map",
          around.kind === "dept" ? `${L.aroundElsewhere} ${L.aroundDept(around.code)}` : L.aroundElsewhere,
          L.aroundElsewhereHint,
          () => setElsewhere(true),
        )}
      </View>
      {elsewhere ? (
        <View style={styles.group} testID="around-departments">
          <TextField
            label={L.aroundElsewhere}
            value={find}
            onChangeText={setFind}
            placeholder="66, Aude, Gironde…"
            testID="around-find"
          />
          {/* Tour 2 : les puces passent à la ligne (une rangée qui défile cachait la fin de la liste). */}
          <View style={styles.wrapRow}>
            {matches.map((d) => (
              <Chip
                key={d.code}
                accessibilityRole="radio"
                selected={around.kind === "dept" && around.code === d.code}
                onPress={() => onAround({ kind: "dept", code: d.code })}
              >
                {departmentLabel(d)}
              </Chip>
            ))}
          </View>
        </View>
      ) : null}
      <View style={styles.group}>
        <Text variant="label" color={c.inkMuted}>
          {L.aroundDistance}
        </Text>
        <View style={styles.wrapRow} accessibilityRole="radiogroup" accessibilityLabel={L.aroundDistance}>
          {RADII.map((km) => (
            <Chip key={km} accessibilityRole="radio" selected={radiusKm === km} onPress={() => onRadius(km)}>
              {L.aroundKm(km)}
            </Chip>
          ))}
          <Chip accessibilityRole="radio" selected={radiusKm === null} onPress={() => onRadius(null)}>
            {L.everywhere}
          </Chip>
        </View>
      </View>
      <Text variant="caption" color={c.inkMuted} style={styles.optHint}>
        {L.aroundSheetHint}
      </Text>
    </View>
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
  onEnable,
}: {
  q: string;
  onChange: (q: string) => void;
  position: ExplorerPosition;
  /** Tour 2 : activer la position, c'est choisir « Autour de moi ». */
  onEnable: () => void;
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
        onPress={() => (on ? position.clear() : onEnable())}
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
  xtools: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space2 },
  filtersEnd: { flexGrow: 1, alignItems: "flex-end" },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  backHome: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", minHeight: 32 },
  backHomeText: { fontSize: 12.5, lineHeight: 16, fontFamily: "Archivo-ExtraBold" },
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
