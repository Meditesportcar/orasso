// Page « Pratique » du site (lot R8q, maquette R8.12 `pratH`), ouverte par « Voir tout » : mêmes mots et mêmes règles que l'appli.
// « Près de moi | Près de ma sortie », les puces « Tout · Stations-service · Lavage », la liste triée par distance ou la carte, la
// bascule « Liste | Carte » collée en bas. Un seul bouton principal par vue : « Y aller » du lieu touché dans la carte. Les
// distances se calculent ici, avec la position exacte (qui ne quitte jamais le navigateur).
import { Button, Chip, ChipRow, Icon } from "@orasso/design-system/web";
import {
  filterKind,
  formatKm,
  practicalTexts as L,
  type LatLng,
  type PracticalChoice,
  type PracticalFilter,
  practicalTitle,
  withDistance,
} from "@orasso/shared";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { ChoiceTabs } from "./PracticalBlock";
import { PracticalMap } from "./PracticalMap";
import { askPracticalPosition, usePracticalPosition } from "./position";
import { PracticalRow } from "./Row";
import { practicalSession, usePracticalSources } from "./usePractical";

const filters: { value: PracticalFilter; label: string }[] = [
  { value: "all", label: L.filterAll },
  { value: "fuel", label: L.filterFuel },
  { value: "wash", label: L.filterWash },
];

export function PracticalScreen() {
  const [params] = useSearchParams();
  const sources = usePracticalSources();
  const { busy } = usePracticalPosition();
  const [choice, setChoice] = useState<PracticalChoice>(
    params.get("ou") === "sortie" ? "outing" : practicalSession.choice,
  );
  const [filter, setFilter] = useState<PracticalFilter>(practicalSession.filter);
  const [view, setView] = useState<"list" | "map">(practicalSession.view);
  const [picked, setPicked] = useState<string | null>(null);

  const outingOrigin = sources.outing.data?.origin ?? null;
  const active: PracticalChoice = outingOrigin ? choice : "me";
  const read = active === "outing" ? sources.outing : sources.me;
  const data = read.data;
  const from: LatLng | null =
    active === "me" && sources.me.exact
      ? sources.me.exact
      : data?.origin
        ? { lat: data.origin.lat, lng: data.origin.lng }
        : null;
  const fromLat = from?.lat;
  const fromLng = from?.lng;
  const list = useMemo(
    () =>
      data && fromLat !== undefined && fromLng !== undefined
        ? filterKind(withDistance(data.places, { lat: fromLat, lng: fromLng }), filter)
        : [],
    [data, fromLat, fromLng, filter],
  );
  // Le lieu touché ; sans toucher, le plus proche est choisi d'office (la maquette ouvre la carte sur lui).
  const selected = list.find((p) => p.id === picked) ?? list[0] ?? null;
  const detail = (p: (typeof list)[number]) => `${L.kindLabel[p.kind]} · ${formatKm(p.distanceKm)}`;
  const mapDetail = (p: (typeof list)[number]) => (active === "outing" ? `${detail(p)} ${L.fromOuting}` : detail(p));
  const titleOf = (p: (typeof list)[number]) => practicalTitle(p, L.unnamed);
  const onPosition = active === "me" && sources.me.onPosition;

  function remember<T>(set: (v: T) => void, key: "choice" | "filter" | "view") {
    return (v: T) => {
      (practicalSession as Record<string, unknown>)[key] = v;
      set(v);
      setPicked(null);
    };
  }

  return (
    <div className="pq-page" data-testid="practical-screen">
      {outingOrigin ? <ChoiceTabs value={active} onChange={remember(setChoice, "choice")} /> : null}
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
      {active === "outing" && data?.origin ? (
        <p className="pq-hint o-t-caption" data-testid="practical-hint">
          <Icon name="ticket" size={14} />
          <span>{L.aroundOuting(data.origin.label)}</span>
        </p>
      ) : null}
      {active === "me" && !onPosition && data ? (
        <p className="pq-hint o-t-caption" data-testid="practical-hint">
          <Icon name="place" size={14} />
          <span>{data.origin ? L.aroundCity(data.origin.label) : L.noOrigin}</span>
        </p>
      ) : null}
      {read.offline && data ? <p className="o-t-caption s-muted">{L.offlineWeb}</p> : null}
      {read.failed ? (
        <div className="pq-gps">
          <Button
            type="button"
            variant="secondary"
            icon="undo"
            disabled={read.loading}
            onClick={read.retry}
            data-testid="practical-retry"
          >
            {L.retry}
          </Button>
        </div>
      ) : null}

      {!data ? (
        <p className="o-t-caption s-muted" data-testid="practical-state">
          {read.loading ? L.loading : L.unavailable}
        </p>
      ) : list.length === 0 ? (
        <p className="o-t-caption s-muted" data-testid="practical-empty">
          {data.partial && data.places.length === 0 ? L.unavailable : L.nothingNear}
        </p>
      ) : view === "map" ? (
        <div data-testid="practical-map-view">
          <div className="pq-mapwrap">
            <PracticalMap
              pins={list.map((p) => ({ id: p.id, kind: p.kind, title: titleOf(p), lat: p.lat, lng: p.lng }))}
              origin={from ? { kind: active === "outing" ? "outing" : "me", at: from } : null}
              selectedId={selected?.id ?? null}
              onSelect={setPicked}
            />
            {selected ? (
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
          <p className="o-t-caption s-muted">{L.mapAttribution}</p>
        </div>
      ) : (
        <div className="pq-rows" data-testid="practical-list">
          {list.map((p, i) => (
            <PracticalRow
              key={p.id}
              kind={p.kind}
              title={titleOf(p)}
              detail={detail(p)}
              lat={p.lat}
              lng={p.lng}
              testId={`practical-row-${i}`}
            />
          ))}
        </div>
      )}
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
      {data && view === "list" && list.length > 0 ? (
        <div className="pq-credits o-t-caption s-muted">
          <span>{data.attribution.wash}</span>
          <span>{data.attribution.fuel}</span>
        </div>
      ) : null}

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
    </div>
  );
}
