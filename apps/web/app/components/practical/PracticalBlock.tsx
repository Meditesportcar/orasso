// Bloc « Pratique » de l'Accueil du site (lot R8q, maquette R8.12 `pratiqueBlock`) : mêmes lignes et mêmes mots que l'appli. La station-
// service et le lavage les plus proches, de moi (ma position si je l'ai donnée, sinon ma ville) ou de ma sortie. Le navigateur lit
// `POST /practical` lui-même, quand le bloc est affiché. Hors ligne ou source muette : rien de faux, jamais une erreur.
import { Button, Icon } from "@orasso/design-system/web";
import {
  formatKm,
  homeWidgetTitles,
  practicalTexts as L,
  type LatLng,
  nearestOfEach,
  type PracticalChoice,
  type PracticalData,
  type PracticalKind,
  practicalTitle,
} from "@orasso/shared";
import { useState } from "react";

import { askPracticalPosition, usePracticalPosition } from "./position";
import { PracticalRow } from "./Row";
import { practicalSession, usePracticalSources } from "./usePractical";

/** Les deux lignes du bloc : la plus proche de chaque sorte, à partir de `from` (la position exacte, sinon l'origine). */
export function blockRows(data: PracticalData, from: LatLng) {
  const nearest = nearestOfEach(data.places, from);
  return (["fuel", "wash"] as const).flatMap((kind: PracticalKind) => {
    const place = nearest[kind];
    return place ? [{ kind, place, title: practicalTitle(place, L.unnamed) }] : [];
  });
}

const heading: Record<PracticalKind, string> = { fuel: L.fuelNearest, wash: L.washNearest };

/** « Près de moi | Près de ma sortie » (partagé avec la page). */
export function ChoiceTabs({ value, onChange }: { value: PracticalChoice; onChange: (next: PracticalChoice) => void }) {
  const options: { value: PracticalChoice; label: string }[] = [
    { value: "me", label: L.nearMe },
    { value: "outing", label: L.nearOuting },
  ];
  return (
    <div className="pq-seg" role="tablist" data-testid="practical-choice">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className="pq-seg__btn o-t-body-strong"
          onClick={() => onChange(o.value)}
          data-testid={`practical-choice-${o.value}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PracticalBlock() {
  const sources = usePracticalSources();
  const { busy } = usePracticalPosition();
  const [choice, setChoice] = useState<PracticalChoice>(practicalSession.choice);
  const outingOrigin = sources.outing.data?.origin ?? null;
  // Sans sortie à venir, le sélecteur est masqué et le bloc reste « près de moi ».
  const active: PracticalChoice = outingOrigin ? choice : "me";
  const read = active === "outing" ? sources.outing : sources.me;
  const data = read.data;
  // Hors ligne, rien de faux : la dernière réponse de la séance, sinon le bloc n'affiche rien.
  if (!data) return null;
  const from: LatLng | null =
    active === "me" && sources.me.exact
      ? sources.me.exact
      : data.origin
        ? { lat: data.origin.lat, lng: data.origin.lng }
        : null;
  const rows = from ? blockRows(data, from) : [];
  const silent = data.partial && data.places.length === 0;
  const choose = (next: PracticalChoice) => {
    practicalSession.choice = next;
    setChoice(next);
  };
  const city = active === "me" && !sources.me.onPosition;
  return (
    <section className="hm-block pq" data-testid="widget-practical" aria-labelledby="hm-practical">
      <div className="pq-head">
        <h2 className="o-t-label hm-block__title" id="hm-practical">
          {homeWidgetTitles.practical}
        </h2>
        <Button
          variant="plate"
          icon="next"
          href={active === "outing" ? "/app/pratique?ou=sortie" : "/app/pratique"}
          data-testid="practical-see-all"
        >
          {L.seeAll}
        </Button>
      </div>
      {outingOrigin ? <ChoiceTabs value={active} onChange={choose} /> : null}
      {active === "outing" && data.origin ? (
        <p className="pq-hint o-t-caption" data-testid="practical-hint">
          <Icon name="ticket" size={14} />
          <span>{L.aroundOuting(data.origin.label)}</span>
        </p>
      ) : null}
      {city ? (
        <p className="pq-hint o-t-caption" data-testid="practical-hint">
          <Icon name="place" size={14} />
          <span>{data.origin ? L.aroundCity(data.origin.label) : L.noOrigin}</span>
        </p>
      ) : null}
      {silent ? (
        <p className="o-t-caption hm-block__muted" data-testid="practical-unavailable">
          {L.unavailable}
        </p>
      ) : data.origin && rows.length === 0 ? (
        <p className="o-t-caption hm-block__muted" data-testid="practical-empty">
          {L.nothingNear}
        </p>
      ) : (
        <div className="pq-rows">
          {rows.map(({ kind, place, title }) => (
            <PracticalRow
              key={kind}
              kind={kind}
              title={heading[kind]}
              detail={`${title} · ${formatKm(place.distanceKm)}`}
              lat={place.lat}
              lng={place.lng}
              testId={`practical-${kind}`}
            />
          ))}
        </div>
      )}
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
      {active === "me" ? (
        <div className="pq-gps">
          <Button
            type="button"
            variant="secondary"
            icon="target"
            disabled={busy}
            onClick={() => void askPracticalPosition(false)}
            data-testid="practical-use-position"
          >
            {sources.me.onPosition ? L.relocate : L.usePosition}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
