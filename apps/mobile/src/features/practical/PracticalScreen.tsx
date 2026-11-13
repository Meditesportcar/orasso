// Écran « Pratique » (lot R8q, maquette R8.12 `pratH`), ouvert par « Voir tout » : plein écran, mode B. « Près de moi | Près de ma
// sortie », le champ « Ville, lieu ou enseigne », les puces « Tout · Stations-service · Lavage », la liste ou la carte (MapLibre et
// OpenStreetMap), la bascule « Liste | Carte » collée en bas. Un seul bouton principal par vue : « Y aller » du lieu touché dans la carte.
// Petit lot de fin F (option C « Hybride » choisie par Damien le 13/11) : la carte, la liste et le compteur suivent la zone regardée ;
// dans ce qui est déjà chargé tout se filtre sur le téléphone, sans réseau ; au-delà, le bouton « Rechercher dans cette zone » (jamais de
// rechargement surprise). Une ville tapée recentre la carte (`GET /geo/cities`, le texte seul part), une enseigne filtre les lieux chargés.
// Les distances se calculent ici, avec la position exacte (qui ne quitte jamais l'appareil) ; le dernier choix de la séance est retenu.
import { Chip, ChipRow, Icon, OLoader, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type PracticalChoice as Choice,
  type CitySuggestion,
  cityNameOf,
  countByKind,
  filterKind,
  formatKm,
  practicalTexts as L,
  type LatLng,
  type MapViewport,
  matchesSearch,
  nearestTownName,
  PRACTICAL_OPEN_VIEW_KM,
  type PracticalFilter,
  practicalNb,
  practicalTitle,
  viewZone,
  withDistance,
  zoneCenter,
  zoneContains,
  zoneIsTooWide,
  zoneNeedsSearch,
  zoomForWidthKm,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ListMapToggle } from "@/features/explorer/ExplorerScreen";
import { AppSheet } from "@/ui/AppSheet";
import { Seg, SmButton } from "@/ui/Kit";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";
import type { MapCommand } from "./mapTypes";
import { PracticalMap } from "./PracticalMap";
import { usePracticalPosition } from "./position";
import { kindIcon, PracticalRow, useGoSheet } from "./Row";
import { giveMyPosition, practicalSession, usePracticalSources } from "./usePractical";
import { useCitySearch, usePracticalZone } from "./useZone";

const { space2, space3 } = tokens.spacing;

/** Hauteur de la carte (`.r8map` de la maquette : 360). */
const MAP_HEIGHT = 360;
/** Largeur supposée de la carte avant sa première mise en page (calcul de la vue de départ). */
const MAP_WIDTH = 352;

const filters: { value: PracticalFilter; label: string }[] = [
  { value: "all", label: L.filterAll },
  { value: "fuel", label: L.filterFuel },
  { value: "wash", label: L.filterWash },
];

/** Une ville cherchée : le centre de la carte et les distances. */
type Searched = { name: string; lat: number; lng: number };

export function PracticalScreen() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ ou?: string }>();
  const { go, sheet } = useGoSheet();
  const sources = usePracticalSources();
  const { busy } = usePracticalPosition();
  const { zone, state: zs } = usePracticalZone();
  const [choice, setChoice] = useState<Choice>(params.ou === "sortie" ? "outing" : practicalSession.choice);
  const [filter, setFilter] = useState<PracticalFilter>(practicalSession.filter);
  const [view, setView] = useState<"list" | "map">(practicalSession.view);
  const [picked, setPicked] = useState<string | null>(null);
  // Le champ « Ville, lieu ou enseigne » : le texte tapé, le texte appliqué (enseigne), la ville cherchée, les propositions ouvertes.
  const [field, setField] = useState("");
  const [text, setText] = useState("");
  const [searched, setSearched] = useState<Searched | null>(null);
  const [suggest, setSuggest] = useState(false);
  const [groupIds, setGroupIds] = useState<string[] | null>(null);
  const [command, setCommand] = useState<MapCommand | null>(null);
  const seq = useRef(0);
  // La dernière vue de la carte : la carte remontée (retour de « Liste » à « Carte ») reprend là où on l'avait laissée.
  const resume = useRef<MapViewport | null>(null);
  const { cities, busy: citiesBusy } = useCitySearch(suggest ? field : "");

  const outingOrigin = sources.outing.data?.origin ?? null;
  const active: Choice = outingOrigin ? choice : "me";
  const read = active === "outing" ? sources.outing : sources.me;
  const data = read.data;
  const base: LatLng | null =
    active === "me" && sources.me.exact
      ? sources.me.exact
      : data?.origin
        ? { lat: data.origin.lat, lng: data.origin.lng }
        : null;
  // Une ville cherchée est l'origine des distances (point tranché de la maquette).
  const from: LatLng | null = searched ? { lat: searched.lat, lng: searched.lng } : base;
  const fromLat = from?.lat;
  const fromLng = from?.lng;

  // Les lieux reçus (ouverture ville, position ou sortie) rejoignent ceux de la mémoire de l'écran.
  useEffect(() => {
    if (sources.me.data) zone.ingest(sources.me.data);
  }, [sources.me.data, zone]);
  useEffect(() => {
    if (sources.outing.data) zone.ingest(sources.outing.data);
  }, [sources.outing.data, zone]);

  // La vue de départ : 8 km autour de l'origine, une seule fois ; ensuite la carte suit les ordres.
  const initial = useRef<MapViewport | null>(null);
  if (!initial.current && fromLat !== undefined && fromLng !== undefined) {
    initial.current = { lat: fromLat, lng: fromLng, zoom: zoomForWidthKm(fromLat, PRACTICAL_OPEN_VIEW_KM, MAP_WIDTH) };
  }
  const flyTo = (p: LatLng, zoomKm = PRACTICAL_OPEN_VIEW_KM) => {
    const v = { lat: p.lat, lng: p.lng, zoom: zoomForWidthKm(p.lat, zoomKm, MAP_WIDTH) };
    seq.current += 1;
    setCommand({ seq: seq.current, view: v });
    // La liste suit aussi quand la carte n'est pas montrée : la vue est connue sans attendre un geste.
    zone.setView(viewZone(v, MAP_WIDTH, MAP_HEIGHT));
    return v;
  };
  // L'origine change (ma position donnée, autre choix) : la carte s'y rend.
  const lastOrigin = useRef<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `flyTo` ne dépend que de la mémoire de l'écran.
  useEffect(() => {
    if (fromLat === undefined || fromLng === undefined || searched) return;
    const key = `${fromLat},${fromLng}`;
    if (lastOrigin.current === null) {
      lastOrigin.current = key;
      zone.setView(viewZone(initial.current ?? { lat: fromLat, lng: fromLng, zoom: 11.4 }, MAP_WIDTH, MAP_HEIGHT));
      return;
    }
    if (lastOrigin.current === key) return;
    lastOrigin.current = key;
    flyTo({ lat: fromLat, lng: fromLng });
  }, [fromLat, fromLng, searched, zone]);

  const titleOf = (p: { kind: "fuel" | "wash"; name: string; address: string | null }) => practicalTitle(p, L.unnamed);
  const kinds = { fuel: filter !== "wash", wash: filter !== "fuel" };
  // Tout ce qui est chargé, filtré par sorte et par enseigne ; la liste et le compteur gardent ceux de la zone regardée.
  const pool = useMemo(
    () => filterKind([...zs.places.values()], filter).filter((p) => matchesSearch(practicalTitle(p, L.unnamed), text)),
    [zs.places, filter, text],
  );
  const inView = useMemo(() => (zs.view ? pool.filter((p) => zoneContains(zs.view as never, p)) : []), [pool, zs.view]);
  const list = useMemo(
    () => (fromLat !== undefined && fromLng !== undefined ? withDistance(inView, { lat: fromLat, lng: fromLng }) : []),
    [inView, fromLat, fromLng],
  );
  const selected = list.find((p) => p.id === picked) ?? list[0] ?? null;
  const detail = (p: (typeof list)[number]) => `${L.kindLabel[p.kind]} · ${formatKm(p.distanceKm)}`;
  const mapDetail = (p: (typeof list)[number]) =>
    active === "outing" && !searched ? `${detail(p)} ${L.fromOuting}` : detail(p);
  const count = countByKind(inView);
  const countLine = practicalNb(L.zoneCount(count.fuel, count.wash, text, kinds));
  const needsSearch = zoneNeedsSearch(zs);
  const tooWide = zoneIsTooWide(zs);
  const originInView = from && zs.view ? zoneContains(zs.view, from) : true;

  const pick =
    <T,>(set: (v: T) => void, key: "choice" | "filter" | "view") =>
    (v: T) => {
      (practicalSession as Record<string, unknown>)[key] = v;
      set(v);
      setPicked(null);
    };
  const onPosition = active === "me" && sources.me.onPosition;

  const clearSearch = () => {
    setField("");
    setText("");
    setSuggest(false);
    if (searched) {
      setSearched(null);
      if (base) flyTo(base);
    }
  };
  const chooseChoice = (next: Choice) => {
    pick(setChoice, "choice")(next);
    setField("");
    setText("");
    setSearched(null);
    setSuggest(false);
    const o = next === "outing" ? sources.outing.data?.origin : (sources.me.exact ?? sources.me.data?.origin);
    if (o) flyTo(o);
  };
  const chooseCity = (g: CitySuggestion) => {
    setSearched({ name: cityNameOf(g.label), lat: g.lat, lng: g.lng });
    setField(g.label);
    setText("");
    setSuggest(false);
    setPicked(null);
    flyTo(g);
    // Une ville choisie est une recherche explicite : lue tout de suite si elle sort de ce qui est chargé.
    zone.searchHere();
  };
  const applyText = () => {
    const q = field.trim();
    setText(q);
    setSuggest(false);
    setPicked(null);
    const matches = filterKind([...zs.places.values()], filter).filter((p) => matchesSearch(titleOf(p), q));
    if (matches.length) {
      seq.current += 1;
      setCommand({ seq: seq.current, fit: matches.map((p) => ({ lat: p.lat, lng: p.lng })) });
    }
  };
  const chooseTextPlace = (p: {
    id: string;
    kind: "fuel" | "wash";
    name: string;
    address: string | null;
    lat: number;
    lng: number;
  }) => {
    setField(titleOf(p));
    setText("");
    setSuggest(false);
    setPicked(p.id);
    seq.current += 1;
    setCommand({ seq: seq.current, view: { lat: p.lat - 0.004, lng: p.lng, zoom: 14 } });
  };

  const q = field.trim();
  const placeMatches = useMemo(() => {
    if (!suggest || q.length < 2 || fromLat === undefined || fromLng === undefined) return [];
    return withDistance(
      [...zs.places.values()].filter((p) => matchesSearch(practicalTitle(p, L.unnamed), q)),
      { lat: fromLat, lng: fromLng },
    );
  }, [suggest, q, zs.places, fromLat, fromLng]);

  const hint = (() => {
    if (!data && !searched) return null;
    if (originInView) {
      if (searched) return { icon: "place" as const, text: L.aroundSearched(searched.name) };
      if (active === "outing" && data?.origin)
        return { icon: "ticket" as const, text: L.aroundOuting(data.origin.label) };
      if (active === "me" && !onPosition) {
        return { icon: "place" as const, text: data?.origin ? L.aroundCity(data.origin.label) : L.noOrigin };
      }
      return null;
    }
    if (!zs.view) return null;
    return { icon: "map" as const, text: L.aroundZone(nearestTownName(zoneCenter(zs.view), [...zs.places.values()])) };
  })();

  const failed = read.failed || zs.failed;
  const offline = read.offline || zs.offline;
  const retryAll = () => {
    if (zs.failed) zone.retry();
    if (read.failed) read.retry();
  };
  const busyZone = zs.loading;

  return (
    <FlowScreen
      title={L.screenTitle}
      facts={L.screenSubtitle}
      closeLabel={L.back}
      onClose={() => router.back()}
      overlays={
        <ListMapToggle
          view={view === "map" ? "map" : "list"}
          onList={() => pick(setView, "view")("list")}
          onMap={() => pick(setView, "view")("map")}
          bottom={insets.bottom + space3 + 2}
        />
      }
    >
      {outingOrigin ? (
        <Seg<Choice>
          options={[
            { value: "me", label: L.nearMe },
            { value: "outing", label: L.nearOuting },
          ]}
          value={searched ? ("none" as Choice) : active}
          onChange={chooseChoice}
          wrap
          compact
          maxFontScale={1.12}
          testID="practical-choice"
        />
      ) : null}
      <SearchField
        value={field}
        onChange={(v) => {
          setField(v);
          setSuggest(true);
        }}
        onClear={clearSearch}
        onSubmit={() => {
          if (cities[0]) chooseCity(cities[0]);
          else if (placeMatches.length) applyText();
        }}
      />
      {suggest && q ? (
        <Suggestions
          query={q}
          cities={cities}
          busy={citiesBusy}
          places={placeMatches
            .slice(0, 4)
            .map((p) => ({ p, title: titleOf(p), sub: `${L.kindLabel[p.kind]} · ${formatKm(p.distanceKm)}` }))}
          total={placeMatches.length}
          onCity={chooseCity}
          onPlace={(id) => {
            const p = zs.places.get(id);
            if (p) chooseTextPlace(p);
          }}
          onApply={applyText}
        />
      ) : null}
      <ChipRow accessibilityRole="tablist">
        {filters.map((f) => (
          <Chip
            key={f.value}
            selected={filter === f.value}
            onPress={() => pick(setFilter, "filter")(f.value)}
            accessibilityRole="tab"
          >
            {f.label}
          </Chip>
        ))}
      </ChipRow>
      {hint ? (
        <View style={styles.hint}>
          <Icon name={hint.icon} size={14} color={c.inkMuted} />
          <Text variant="caption" color={c.inkMuted} style={styles.hintText} testID="practical-hint">
            {practicalNb(hint.text)}
          </Text>
        </View>
      ) : null}
      {offline && (data || zs.places.size > 0) ? <Notice>{L.offline}</Notice> : null}
      {failed ? (
        <View style={styles.gps}>
          <SmButton
            kind="s"
            icon="undo"
            disabled={read.loading || busyZone}
            onPress={retryAll}
            testID="practical-retry"
          >
            {L.retry}
          </SmButton>
        </View>
      ) : null}

      {!data && zs.places.size === 0 ? (
        <Text variant="caption" color={c.inkMuted} testID="practical-state">
          {read.loading ? L.loading : L.unavailable}
        </Text>
      ) : view === "map" && initial.current ? (
        <View testID="practical-map-view">
          <View style={styles.mapWrap}>
            <PracticalMap
              pins={pool.map((p) => ({ id: p.id, kind: p.kind, title: titleOf(p), lat: p.lat, lng: p.lng }))}
              origin={from ? { kind: searched ? "searched" : active === "outing" ? "outing" : "me", at: from } : null}
              selectedId={selected?.id ?? null}
              onSelect={setPicked}
              onGroup={setGroupIds}
              initial={resume.current ?? initial.current}
              command={command}
              cover={zs.cover}
              onView={(z, zoom) => {
                zone.setView(z);
                resume.current = { ...zoneCenter(z), zoom };
              }}
              height={MAP_HEIGHT}
            />
            <View style={[styles.plaque, { backgroundColor: c.surface }]} pointerEvents="none">
              <Icon name="layers" size={14} color={c.ink} />
              <Text variant="meta" color={c.ink} testID="practical-count">
                {countLine}
              </Text>
            </View>
            {!originInView ? (
              <View style={styles.recenter}>
                <SmButton
                  kind="s"
                  icon="target"
                  accessibilityLabel={L.recenter}
                  onPress={() => from && flyTo(from)}
                  testID="practical-recenter"
                />
              </View>
            ) : null}
            <View style={styles.bottom} pointerEvents="box-none">
              {tooWide ? (
                <View style={[styles.note, { backgroundColor: c.surface }]} testID="practical-zoom-note">
                  <Icon name="info" size={14} color={c.inkMuted} />
                  <Text variant="caption" color={c.ink}>
                    {L.zoomIn}
                  </Text>
                </View>
              ) : needsSearch || busyZone ? (
                <ZoneButton
                  busy={busyZone}
                  failed={zs.failed}
                  onPress={() => (zs.failed ? zone.retry() : zone.searchHere())}
                />
              ) : null}
              {selected && !tooWide ? (
                <PracticalRow
                  kind={selected.kind}
                  title={titleOf(selected)}
                  detail={mapDetail(selected)}
                  onGo={() => go({ title: titleOf(selected), lat: selected.lat, lng: selected.lng })}
                  primary
                  testID="practical-selected"
                />
              ) : null}
            </View>
          </View>
          <Text variant="caption" color={c.inkMuted} style={styles.credit}>
            {L.mapAttribution}
          </Text>
        </View>
      ) : (
        <View style={styles.rows} testID="practical-list">
          <View style={styles.count}>
            <Icon name="layers" size={14} color={c.ink} />
            <Text variant="bodyStrong" color={c.ink} testID="practical-count">
              {countLine}
            </Text>
          </View>
          {needsSearch || busyZone ? (
            <ZoneButton
              busy={busyZone}
              failed={zs.failed}
              onPress={() => (zs.failed ? zone.retry() : zone.searchHere())}
            />
          ) : null}
          {list.length === 0 ? (
            <Text variant="caption" color={c.inkMuted} testID="practical-empty">
              {tooWide
                ? L.zoomIn
                : data?.partial && data.places.length === 0 && zs.places.size === 0
                  ? L.unavailable
                  : L.nothingInZone}
            </Text>
          ) : null}
          {list.map((p, i) => (
            <PracticalRow
              key={p.id}
              kind={p.kind}
              title={titleOf(p)}
              detail={detail(p)}
              onGo={() => go({ title: titleOf(p), lat: p.lat, lng: p.lng })}
              testID={`practical-row-${i}`}
            />
          ))}
        </View>
      )}
      {active === "me" && data ? (
        <View style={styles.gps}>
          <SmButton
            kind="s"
            icon="target"
            disabled={busy}
            onPress={() => void giveMyPosition()}
            testID="practical-use-position"
          >
            {onPosition ? L.relocate : L.usePosition}
          </SmButton>
        </View>
      ) : null}
      {data && view === "list" && list.length > 0 ? (
        <View style={styles.credits}>
          <Text variant="caption" color={c.inkMuted}>
            {data.attribution.wash}
          </Text>
          <Text variant="caption" color={c.inkMuted}>
            {data.attribution.fuel}
          </Text>
        </View>
      ) : null}
      <View style={styles.bar} />
      {sheet}
      <AppSheet
        visible={groupIds !== null}
        onClose={() => setGroupIds(null)}
        accessibilityLabel={L.groupHere(groupIds?.length ?? 0)}
      >
        <Text variant="posterS" accessibilityRole="header" testID="practical-group-title">
          {L.groupHere(groupIds?.length ?? 0)}
        </Text>
        {(() => {
          const items = (groupIds ?? []).flatMap((id) => {
            const p = zs.places.get(id);
            return p ? [p] : [];
          });
          const first = items.find((p) => p.kind === "fuel") ?? items[0];
          return (
            <>
              {first ? (
                <Text variant="caption" color={c.inkMuted}>
                  {practicalNb(L.groupSame(titleOf(first)))}
                </Text>
              ) : null}
              {from
                ? withDistance(items, from).map((p, i) => (
                    <PracticalRow
                      key={p.id}
                      kind={p.kind}
                      title={titleOf(p)}
                      detail={detail(p)}
                      onGo={() => {
                        setGroupIds(null);
                        go({ title: titleOf(p), lat: p.lat, lng: p.lng });
                      }}
                      testID={`practical-group-row-${i}`}
                    />
                  ))
                : null}
            </>
          );
        })()}
      </AppSheet>
    </FlowScreen>
  );
}

/** Le bouton « Rechercher dans cette zone » (asphalte, texte crème) : le O vivant remplace l'icône pendant la lecture. */
function ZoneButton({ busy, failed, onPress }: { busy: boolean; failed: boolean; onPress: () => void }) {
  const { t } = useTheme();
  const c = t.color;
  const label = failed ? L.retry : L.searchHere;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      onPress={onPress}
      style={[styles.zoneBtn, { backgroundColor: c.ink }]}
      testID="practical-search-here"
    >
      {busy ? (
        <OLoader size={18} ink={c.ground} label={null} />
      ) : (
        <Icon name={failed ? "undo" : "search"} size={16} color={c.ground} />
      )}
      <Text variant="meta" color={c.ground}>
        {busy ? L.loadingZone : label}
      </Text>
    </Pressable>
  );
}

/** Le champ « Ville, lieu ou enseigne » (40 px, rayon 12), ✕ pour l'effacer. */
function SearchField({
  value,
  onChange,
  onClear,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  onClear: () => void;
  onSubmit: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View style={[styles.field, { backgroundColor: c.surfaceField, borderColor: c.line }]}>
      <Icon name="search" size={16} color={c.inkMuted} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={L.searchPlaceholder}
        placeholderTextColor={c.inkFaint}
        accessibilityLabel={L.searchLabel}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        style={[styles.input, { color: c.ink }]}
        testID="practical-search"
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={L.clearSearch}
          onPress={onClear}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          style={[styles.clear, { backgroundColor: c.surfaceRaised }]}
          testID="practical-search-clear"
        >
          <Icon name="close" size={16} color={c.ink} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Les propositions sous le champ : villes (`GET /geo/cities`) et lieux chargés de la zone. */
function Suggestions({
  query,
  cities,
  busy,
  places,
  total,
  onCity,
  onPlace,
  onApply,
}: {
  query: string;
  cities: CitySuggestion[];
  busy: boolean;
  places: { p: { id: string; kind: "fuel" | "wash" }; title: string; sub: string }[];
  total: number;
  onCity: (g: CitySuggestion) => void;
  onPlace: (id: string) => void;
  onApply: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const empty = query.length >= 2 && !busy && cities.length === 0 && places.length === 0;
  return (
    <View style={[styles.sg, { backgroundColor: c.surface, borderColor: c.line }]} testID="practical-suggest">
      {query.length < 2 ? (
        <View style={styles.sgRow}>
          <Icon name="info" size={14} color={c.inkMuted} />
          <Text variant="caption" color={c.inkMuted}>
            {L.searchHint}
          </Text>
        </View>
      ) : empty ? (
        <View style={styles.sgEmpty} testID="practical-suggest-empty">
          <Text variant="bodyStrong" color={c.ink}>
            {L.searchEmpty}
          </Text>
          <Text variant="caption" color={c.inkMuted}>
            {practicalNb(L.noBrand)}
          </Text>
        </View>
      ) : (
        <>
          {cities.length ? (
            <>
              <Text variant="label" color={c.inkMuted}>
                {L.citiesTitle}
              </Text>
              {cities.slice(0, 4).map((g, i) => (
                <Pressable
                  key={`${g.label}-${g.lat}-${g.lng}`}
                  onPress={() => onCity(g)}
                  accessibilityRole="button"
                  style={styles.sgRow}
                  testID={`practical-suggest-city-${i}`}
                >
                  <Icon name="place" size={14} color={c.ink} />
                  <View style={styles.sgText}>
                    <Text variant="bodyStrong" color={c.ink}>
                      {g.label}
                    </Text>
                    <Text variant="caption" color={c.inkMuted}>
                      {L.commune}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </>
          ) : null}
          {places.length ? (
            <>
              <Text variant="label" color={c.inkMuted}>
                {L.inZoneTitle}
              </Text>
              {places.map(({ p, title, sub }) => (
                <Pressable
                  key={p.id}
                  onPress={() => onPlace(p.id)}
                  accessibilityRole="button"
                  style={styles.sgRow}
                  testID={`practical-suggest-place-${p.id}`}
                >
                  <Icon name={kindIcon[p.kind]} size={14} color={c.ink} />
                  <View style={styles.sgText}>
                    <Text variant="bodyStrong" color={c.ink}>
                      {title}
                    </Text>
                    <Text variant="caption" color={c.inkMuted}>
                      {sub}
                    </Text>
                  </View>
                </Pressable>
              ))}
              <SmButton kind="s" icon="filter" onPress={onApply} testID="practical-apply-text">
                {practicalNb(L.showMatches(total, query))}
              </SmButton>
            </>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rows: { gap: 8 },
  count: { flexDirection: "row", alignItems: "center", gap: 8 },
  hint: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  hintText: { flex: 1 },
  mapWrap: { position: "relative" },
  plaque: {
    position: "absolute",
    left: 10,
    top: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: tokens.radius.radiusMd,
    maxWidth: "70%",
  },
  recenter: { position: "absolute", right: 10, top: 10 },
  bottom: { position: "absolute", left: 10, right: 10, bottom: 10, gap: 8, alignItems: "stretch" },
  note: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: tokens.radius.radiusMd,
  },
  zoneBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: tokens.radius.radiusMd,
    alignSelf: "center",
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  input: { flex: 1, minWidth: 0, paddingVertical: 8, fontSize: 14 },
  clear: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  sg: { gap: 8, padding: 12, borderRadius: tokens.radius.radiusMd, borderWidth: 1 },
  sgRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 40 },
  sgText: { flex: 1, minWidth: 0 },
  sgEmpty: { gap: 4 },
  credit: { paddingTop: space2 },
  credits: { gap: 2, paddingTop: space2 },
  gps: { alignItems: "flex-start", paddingTop: space3 - space2 },
  // La place de la bascule « Liste | Carte » collée en bas : le dernier lieu reste lisible au-dessus d'elle.
  bar: { height: 56 },
});
