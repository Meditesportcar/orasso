// Onglet « Spots » du crew sur le site (lot R7b2 pour l'état vide, lot R7i pour le contenu, maquette R7.11 `ct_spo`) : les
// rendez-vous au spot lancés pour le crew. D'abord ceux qui durent (carte, « Je viens » / « Peut-être »), puis les 30 derniers
// jours sans lieu ni liste. « Lancer un rendez-vous pour le crew » ouvre le formulaire, audience préremplie. Tout est décidé
// par l'API (membres actifs seulement) ; une panne se dit et se relance, jamais une liste vide.
import { Button, Icon } from "@orasso/design-system/web";
import { spotLabels as L, type SpotCrewList, type SpotMeetupView, crewTabLabels as T } from "@orasso/shared";
import { useEffect, useState } from "react";

import { apiFetch } from "../../lib/api.client";
import { formatDay, formatTime } from "../../lib/format";
import { PersonAvatar } from "../People";
import { SpotCard } from "../spot/SpotCard";
import "../../styles/spot.css";

export function CrewSpots({ crewId, archived }: { crewId: string; archived?: boolean }) {
  const [active, setActive] = useState<SpotMeetupView[]>([]);
  const [past, setPast] = useState<SpotMeetupView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(from: string | null) {
    setBusy(true);
    const res = await apiFetch<SpotCrewList>(
      `/crews/${crewId}/spot-meetups${from ? `?cursor=${encodeURIComponent(from)}` : ""}`,
    );
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      if (!from) setState("error");
      return;
    }
    setError(null);
    if (from) setPast((p) => [...p, ...res.data.past.filter((x) => !p.some((y) => y.id === x.id))]);
    else {
      setActive(res.data.active);
      setPast(res.data.past);
      setState("ready");
    }
    setCursor(res.data.nextCursor);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: lu une fois par crew.
  useEffect(() => {
    void load(null);
  }, [crewId]);

  const empty = state === "ready" && active.length === 0 && past.length === 0;
  const launch = archived ? null : (
    <Button
      variant="secondary"
      icon="place"
      fullWidth
      href={`/app/spot/nouveau?crew=${crewId}`}
      data-testid="crew-spots-launch"
    >
      {L.launchForCrew}
    </Button>
  );
  const replace = (view: SpotMeetupView) => setActive((a) => a.map((x) => (x.id === view.id ? view : x)));
  return (
    <section className="crw-col" data-testid="crew-spots">
      {empty ? null : launch}
      {state === "error" ? (
        <div className="crw-empty" role="alert" data-testid="crew-spots-error">
          <p className="o-t-caption">{error}</p>
          <Button variant="secondary" icon="undo" onClick={() => void load(null)} data-testid="crew-spots-retry">
            {L.errorRetry}
          </Button>
        </div>
      ) : null}
      {empty ? (
        <>
          <div className="crw-empty">
            <Icon name="place" size={28} />
            <h2 className="s-h2">{T.spotsEmptyTitle}</h2>
            <p className="o-t-caption s-muted">{T.spotsEmptyHint}</p>
          </div>
          {launch}
        </>
      ) : null}
      {active.length ? <h2 className="s-h2">{L.crewActive}</h2> : null}
      <div className="spot-cards">
        {active.map((m) => (
          <SpotCard key={m.id} meetup={m} testid="crew-spot-card" onChange={replace} />
        ))}
      </div>
      {past.length ? <h2 className="s-h2">{L.crewPast}</h2> : null}
      {past.map((m) => (
        <div key={m.id} className="spot-past" data-testid="crew-spot-past">
          <PersonAvatar url={m.author.avatarUrl} pseudo={m.author.pseudo} size={32} />
          <span className="spot-card__who">
            <strong className="o-never-truncate">{L.from(m.author.pseudo)}</strong>
            <span className="o-t-caption s-muted">
              {`${formatDay(m.startsAt)} · ${formatTime(m.startsAt)}${m.cameCount !== null ? ` · ${L.endedCame(m.cameCount)}` : ""}`}
            </span>
          </span>
        </div>
      ))}
      {cursor ? (
        <Button
          variant="secondary"
          icon="down"
          fullWidth
          disabled={busy}
          onClick={() => void load(cursor)}
          data-testid="crew-spots-more"
        >
          Voir plus
        </Button>
      ) : null}
      {state === "ready" && error ? (
        <p className="o-t-caption" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
