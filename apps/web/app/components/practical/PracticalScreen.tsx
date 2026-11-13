// Page « Pratique » du site (lot R8q, maquette R8.12 `pratH`), ouverte par « Voir tout » : mêmes mots et mêmes règles que l'appli.
// « Près de moi | Près de ma sortie », le champ « Ville, lieu ou enseigne », les puces « Tout · Stations-service · Lavage », la liste ou la
// carte, la bascule « Liste | Carte » collée en bas. Un seul bouton principal par vue : « Y aller » du lieu touché dans la carte.
// Petit lot de fin F (option C « Hybride ») : la carte, la liste et le compteur suivent la zone regardée ; dans ce qui est déjà chargé tout
// se filtre dans le navigateur, sans réseau ; au-delà, le bouton « Rechercher dans cette zone » (jamais de rechargement surprise). À
// 900 px et plus, la liste et la carte sont côte à côte (vue 1280 px de la maquette). Les distances se calculent ici, avec la position exacte
// (qui ne quitte jamais le navigateur).
import { Button, Chip, ChipRow, Icon, OLoader } from "@orasso/design-system/web";
import {
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
  type PracticalChoice,
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
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "react-router";
import { ChoiceTabs } from "./PracticalBlock";
import { type MapCommand, PracticalMap } from "./PracticalMap";
import { askPracticalPosition, usePracticalPosition } from "./position";
import { kindIcon, PracticalRow } from "./Row";
import { practicalSession, usePracticalSources } from "./usePractical";
import { useCitySearch, usePracticalZone } from "./useZone";

const filters: { value: PracticalFilter; label: string }[] = [
  { value: "all", label: L.filterAll },
  { value: "fuel", label: L.filterFuel },
  { value: "wash", label: L.filterWash },
];

const MAP_WIDTH = 352;
const MAP_HEIGHT = 360;

/** 900 px et plus : la liste et la carte côte à côte. Côté serveur, faux (la page se rend en une colonne). */
function useWide(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(min-width: 900px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(min-width: 900px)").matches,
    () => false,
  );
}

type Searched = { name: string; lat: number; lng: number };
type PlaceLike = { id: string; kind: "fuel" | "wash"; name: string; address: string | null; lat: number; lng: number };

export function PracticalScreen() {
  const [params] = useSearchParams();
  const sources = usePracticalSources();
  const { busy } = usePracticalPosition();
  const { zone, state: zs } = usePracticalZone();
  const wide = useWide();
  const [choice, setChoice] = useState<PracticalChoice>(
    params.get("ou") === "sortie" ? "outing" : practicalSession.choice,
  );
  const [filter, setFilter] = useState<PracticalFilter>(practicalSession.filter);
  const [view, setView] = useState<"list" | "map">(practicalSession.view);
  const [picked, setPicked] = useState<string | null>(null);
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
  const active: PracticalChoice = outingOrigin ? choice : "me";
  const read = active === "outing" ? sources.outing : sources.me;
  const data = read.data;
  const base: LatLng | null =
    active === "me" && sources.me.exact
      ? sources.me.exact
      : data?.origin
        ? { lat: data.origin.lat, lng: data.origin.lng }
        : null;
  const from: LatLng | null = searched ? { lat: searched.lat, lng: searched.lng } : base;
  const fromLat = from?.lat;
  const fromLng = from?.lng;

  useEffect(() => {
    if (sources.me.data) zone.ingest(sources.me.data);
  }, [sources.me.data, zone]);
  useEffect(() => {
    if (sources.outing.data) zone.ingest(sources.outing.data);
  }, [sources.outing.data, zone]);

  const initial = useRef<MapViewport | null>(null);
  if (!initial.current && fromLat !== undefined && fromLng !== undefined) {
    initial.current = { lat: fromLat, lng: fromLng, zoom: zoomForWidthKm(fromLat, PRACTICAL_OPEN_VIEW_KM, MAP_WIDTH) };
  }
  const flyTo = (p: LatLng) => {
    const v = { lat: p.lat, lng: p.lng, zoom: zoomForWidthKm(p.lat, PRACTICAL_OPEN_VIEW_KM, MAP_WIDTH) };
    seq.current += 1;
    setCommand({ seq: seq.current, view: v });
    zone.setView(viewZone(v, MAP_WIDTH, MAP_HEIGHT));
  };
  const lastOrigin = useRef<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `flyTo` ne dépend que de la mémoire de la page.
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

  const titleOf = (p: Pick<PlaceLike, "kind" | "name" | "address">) => practicalTitle(p, L.unnamed);
  const kinds = { fuel: filter !== "wash", wash: filter !== "fuel" };
  const pool = useMemo(
    () => filterKind([...zs.places.values()], filter).filter((p) => matchesSearch(practicalTitle(p, L.unnamed), text)),
    [zs.places, filter, text],
  );
  const zview = zs.view;
  const inView = useMemo(() => (zview ? pool.filter((p) => zoneContains(zview, p)) : []), [pool, zview]);
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
  const originInView = from && zview ? zoneContains(zview, from) : true;
  const onPosition = active === "me" && sources.me.onPosition;

  function remember<T>(set: (v: T) => void, key: "choice" | "filter" | "view") {
    return (v: T) => {
      (practicalSession as Record<string, unknown>)[key] = v;
      set(v);
      setPicked(null);
    };
  }
  const clearSearch = () => {
    setField("");
    setText("");
    setSuggest(false);
    if (searched) {
      setSearched(null);
      if (base) flyTo(base);
    }
  };
  const chooseChoice = (next: PracticalChoice) => {
    remember(setChoice, "choice")(next);
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
  const choosePlace = (p: PlaceLike) => {
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
    if (!zview) return null;
    return { icon: "map" as const, text: L.aroundZone(nearestTownName(zoneCenter(zview), [...zs.places.values()])) };
  })();

  const failed = read.failed || zs.failed;
  const offline = read.offline || zs.offline;
  const retryAll = () => {
    if (zs.failed) zone.retry();
    if (read.failed) read.retry();
  };

  const zoneBtn = (testId: string) =>
    needsSearch || zs.loading ? (
      <div className="pq-zonewrap">
        {zs.failed && zs.offline ? (
          <p className="pq-zonenote o-t-caption" data-testid="practical-offline-note">
            {L.searchHereOffline}
          </p>
        ) : null}
        <button
          type="button"
          className="pq-zonebtn o-t-meta"
          disabled={zs.loading}
          aria-busy={zs.loading}
          onClick={() => (zs.failed ? zone.retry() : zone.searchHere())}
          data-testid={testId}
        >
          {zs.loading ? (
            <OLoader size={18} tone="dark" label={null} />
          ) : (
            <Icon name={zs.failed ? "undo" : "search"} size={16} />
          )}
          <span>{zs.loading ? L.loadingZone : zs.failed ? L.retry : L.searchHere}</span>
        </button>
      </div>
    ) : null;
  const zoneButton = zoneBtn("practical-search-here");

  const mapNode =
    initial.current && (data || zs.places.size > 0) ? (
      <div data-testid="practical-map-view">
        <div className="pq-mapwrap">
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
          />
          <p className="pq-plaque o-t-caption" data-testid="practical-count">
            <Icon name="layers" size={14} />
            <span>{countLine}</span>
          </p>
          {!originInView ? (
            <button
              type="button"
              className="pq-recenter"
              aria-label={L.recenter}
              title={L.recenter}
              onClick={() => from && flyTo(from)}
              data-testid="practical-recenter"
            >
              <Icon name="target" size={18} />
            </button>
          ) : null}
          <div className="pq-bottom">
            {tooWide ? (
              <p className="pq-note o-t-caption" data-testid="practical-zoom-note">
                <Icon name="info" size={14} />
                <span>{L.zoomIn}</span>
              </p>
            ) : (
              zoneButton
            )}
            {selected && !tooWide ? (
              <div className="pq-selected">
                <PracticalRow
                  kind={selected.kind}
                  title={titleOf(selected)}
                  detail={mapDetail(selected)}
                  lat={selected.lat}
                  lng={selected.lng}
                  primary
                  testId="practical-selected"
                />
              </div>
            ) : null}
          </div>
        </div>
        <p className="o-t-caption s-muted pq-credit">{L.mapAttribution}</p>
      </div>
    ) : null;

  const listNode = (
    <div className="pq-rows" data-testid="practical-list">
      <p className="pq-count o-t-body-strong" data-testid={wide ? undefined : "practical-count"}>
        <Icon name="layers" size={14} />
        <span>{countLine}</span>
      </p>
      {wide ? zoneBtn("practical-search-here-list") : zoneButton}
      {list.length === 0 ? (
        <p className="o-t-caption s-muted" data-testid="practical-empty">
          {tooWide
            ? L.zoomIn
            : data?.partial && data.places.length === 0 && zs.places.size === 0
              ? L.unavailable
              : L.nothingInZone}
        </p>
      ) : null}
      {list.map((p, i) => (
        <PracticalRow
          key={p.id}
          kind={p.kind}
          title={titleOf(p)}
          detail={detail(p)}
          lat={p.lat}
          lng={p.lng}
          selected={wide && p.id === selected?.id}
          testId={`practical-row-${i}`}
        />
      ))}
    </div>
  );

  const controls = (
    <>
      {outingOrigin ? (
        <ChoiceTabs value={searched ? ("none" as PracticalChoice) : active} onChange={chooseChoice} />
      ) : null}
      <div className="pq-field" data-testid="practical-field">
        <Icon name="search" size={16} />
        <input
          type="search"
          value={field}
          placeholder={L.searchPlaceholder}
          aria-label={L.searchLabel}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setField(e.target.value);
            setSuggest(true);
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            if (cities[0]) chooseCity(cities[0]);
            else if (placeMatches.length) applyText();
          }}
          data-testid="practical-search"
        />
        {field ? (
          <button
            type="button"
            className="pq-field__x"
            aria-label={L.clearSearch}
            onClick={clearSearch}
            data-testid="practical-search-clear"
          >
            <Icon name="close" size={16} />
          </button>
        ) : null}
      </div>
      {suggest && q ? (
        <div className="pq-sg" data-testid="practical-suggest">
          {q.length < 2 ? (
            <p className="pq-sg__row o-t-caption">
              <Icon name="info" size={14} />
              <span>{L.searchHint}</span>
            </p>
          ) : !citiesBusy && cities.length === 0 && placeMatches.length === 0 ? (
            <div className="pq-sg__empty" data-testid="practical-suggest-empty">
              <b className="o-t-body-strong">{L.searchEmpty}</b>
              <small className="o-t-caption s-muted">{practicalNb(L.noBrand)}</small>
            </div>
          ) : (
            <>
              {cities.length ? <p className="pq-sg__h o-t-label">{L.citiesTitle}</p> : null}
              {cities.slice(0, 4).map((g, i) => (
                <button
                  key={`${g.label}-${g.lat}-${g.lng}`}
                  type="button"
                  className="pq-sg__row"
                  onClick={() => chooseCity(g)}
                  data-testid={`practical-suggest-city-${i}`}
                >
                  <Icon name="place" size={14} />
                  <span>
                    <b className="o-t-body-strong">{g.label}</b>
                    <small className="o-t-caption s-muted">{L.commune}</small>
                  </span>
                </button>
              ))}
              {placeMatches.length ? <p className="pq-sg__h o-t-label">{L.inZoneTitle}</p> : null}
              {placeMatches.slice(0, 4).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="pq-sg__row"
                  onClick={() => choosePlace(p)}
                  data-testid={`practical-suggest-place-${p.id}`}
                >
                  <Icon name={kindIcon[p.kind]} size={14} />
                  <span>
                    <b className="o-t-body-strong">{titleOf(p)}</b>
                    <small className="o-t-caption s-muted">{detail(p)}</small>
                  </span>
                </button>
              ))}
              {placeMatches.length ? (
                <Button
                  type="button"
                  variant="secondary"
                  icon="filter"
                  onClick={applyText}
                  data-testid="practical-apply-text"
                >
                  {practicalNb(L.showMatches(placeMatches.length, q))}
                </Button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
      <ChipRow role="tablist">
        {filters.map((f) => (
          <Chip
            key={f.value}
            selected={filter === f.value}
            onClick={() => remember(setFilter, "filter")(f.value)}
            role="tab"
            aria-selected={filter === f.value}
            data-testid={`practical-filter-${f.value}`}
          >
            {f.label}
          </Chip>
        ))}
      </ChipRow>
      {hint ? (
        <p className="pq-hint o-t-caption" data-testid="practical-hint">
          <Icon name={hint.icon} size={14} />
          <span>{practicalNb(hint.text)}</span>
        </p>
      ) : null}
      {offline && (data || zs.places.size > 0) ? <p className="o-t-caption s-muted">{L.offlineWeb}</p> : null}
      {failed ? (
        <div className="pq-gps">
          <Button
            type="button"
            variant="secondary"
            icon="undo"
            disabled={read.loading || zs.loading}
            onClick={retryAll}
            data-testid="practical-retry"
          >
            {L.retry}
          </Button>
        </div>
      ) : null}
    </>
  );

  const tail = (
    <>
      {active === "me" && data ? (
        <div className="pq-gps">
          <Button
            type="button"
            variant="secondary"
            icon="target"
            disabled={busy}
            onClick={() => void askPracticalPosition(false)}
            data-testid="practical-use-position"
          >
            {onPosition ? L.relocate : L.usePosition}
          </Button>
        </div>
      ) : null}
      {data && list.length > 0 && (wide || view === "list") ? (
        <div className="pq-credits o-t-caption s-muted">
          <span>{data.attribution.wash}</span>
          <span>{data.attribution.fuel}</span>
        </div>
      ) : null}
    </>
  );

  const groupSheet =
    groupIds !== null ? (
      <div
        className="pq-sheet"
        role="dialog"
        aria-label={L.groupHere(groupIds.length)}
        data-testid="practical-group-sheet"
      >
        <div className="pq-sheet__head">
          <b className="o-t-poster-m">{L.groupHere(groupIds.length)}</b>
          <button type="button" className="pq-field__x" aria-label="Fermer" onClick={() => setGroupIds(null)}>
            <Icon name="close" size={16} />
          </button>
        </div>
        {(() => {
          const items = groupIds.flatMap((id) => {
            const p = zs.places.get(id);
            return p ? [p] : [];
          });
          const first = items.find((p) => p.kind === "fuel") ?? items[0];
          return (
            <>
              {first ? <p className="o-t-caption s-muted">{practicalNb(L.groupSame(titleOf(first)))}</p> : null}
              {from
                ? withDistance(items, from).map((p, i) => (
                    <PracticalRow
                      key={p.id}
                      kind={p.kind}
                      title={titleOf(p)}
                      detail={detail(p)}
                      lat={p.lat}
                      lng={p.lng}
                      testId={`practical-group-row-${i}`}
                    />
                  ))
                : null}
            </>
          );
        })()}
      </div>
    ) : null;

  const empty = !data && zs.places.size === 0;
  return (
    <div className={`pq-page${wide ? " pq-page--wide" : ""}`} data-testid="practical-screen">
      {wide ? (
        <>
          <div className="pq-side">
            {controls}
            {empty ? (
              <p className="o-t-caption s-muted" data-testid="practical-state">
                {read.loading ? L.loading : L.unavailable}
              </p>
            ) : (
              listNode
            )}
            {tail}
          </div>
          <div className="pq-main">{mapNode}</div>
        </>
      ) : (
        <>
          {controls}
          {empty ? (
            <p className="o-t-caption s-muted" data-testid="practical-state">
              {read.loading ? L.loading : L.unavailable}
            </p>
          ) : view === "map" && mapNode ? (
            mapNode
          ) : (
            listNode
          )}
          {tail}
          <div className="pq-bar">
            <div className="pq-vt" role="tablist" data-testid="list-map-toggle">
              <button
                type="button"
                role="tab"
                aria-selected={view === "list"}
                className="pq-vt__btn"
                onClick={() => remember(setView, "view")("list")}
                data-testid="list-toggle"
              >
                <Icon name="list" size={16} />
                <span>{L.list}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === "map"}
                className="pq-vt__btn"
                onClick={() => remember(setView, "view")("map")}
                data-testid="map-toggle"
              >
                <Icon name="map" size={16} />
                <span>{L.map}</span>
              </button>
            </div>
          </div>
        </>
      )}
      {groupSheet}
    </div>
  );
}
