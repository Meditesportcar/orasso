// Un rendez-vous au spot sur le site (lot R7i, maquette R7.9 « Reçu » et « Après »), mêmes règles et mêmes mots que l'appli
// (`features/spot/SpotScreen.tsx`) : la carte du lieu (lieu exact, servi à l'auteur et aux invités seulement), l'heure, le mot,
// « Qui vient ? », « Je viens » / « Peut-être ». L'auteur voit qui vient et peut annuler. Fini : « Ce rendez-vous est terminé »,
// sans lieu ni liste. Tout est décidé par l'API.
import { Button, Icon } from "@orasso/design-system/web";
import {
  agoLabel,
  spotLabels as L,
  type SpotMeetupView,
  type SpotReplies,
  spotEndLabel,
  spotTimeLabel,
  spotUntilLabel,
} from "@orasso/shared";
import { useEffect, useState } from "react";

import { apiFetch } from "../../lib/api.client";
import { now } from "../../lib/clock";
import { EventMap } from "../EventMap";
import { PersonAvatar } from "../People";
import { useSpotAnswer } from "./useSpotAnswer";
import "../../styles/spot.css";

export function SpotDetail({ initial }: { initial: SpotMeetupView }) {
  const [meetup, setMeetup] = useState(initial);
  useEffect(() => setMeetup(initial), [initial]);
  const answer = useSpotAnswer(meetup, setMeetup);
  const over = meetup.phase === "ended";
  const start = new Date(meetup.startsAt);
  const end = new Date(meetup.endsAt);
  const [replies, setReplies] = useState<SpotReplies | null>(null);
  const [repliesError, setRepliesError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: relue quand les compteurs bougent.
  useEffect(() => {
    if (over) return;
    let alive = true;
    void apiFetch<SpotReplies>(`/spot-meetups/${meetup.id}/replies`).then((res) => {
      if (!alive) return;
      if (res.ok) {
        setReplies(res.data);
        setRepliesError(null);
      } else setRepliesError(res.error.message);
    });
    return () => {
      alive = false;
    };
  }, [meetup.id, meetup.yesCount, meetup.maybeCount, over]);

  // Relu toutes les 30 s tant qu'il dure (comme l'appli) : la fin efface le lieu à l'écran.
  useEffect(() => {
    if (over) return;
    const timer = window.setInterval(() => {
      void apiFetch<SpotMeetupView>(`/spot-meetups/${meetup.id}`).then((res) => {
        if (res.ok) setMeetup(res.data);
      });
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [meetup.id, over]);

  async function cancel() {
    setBusy(true);
    setError(null);
    const res = await apiFetch<{ ok: true }>(`/me/spot-meetups/${meetup.id}`, { method: "DELETE" });
    if (res.ok) window.location.assign("/app");
    else {
      setError(res.error.message);
      setBusy(false);
    }
  }

  if (over) {
    return (
      <div className="spot-page" data-testid="spot-ended">
        <div className="spot-card">
          <div className="spot-ended">
            <Icon name="wait" size={26} />
            <div>
              <strong data-testid="spot-ended-title">{meetup.mine ? L.endedMine : L.ended}</strong>
              <p className="o-t-caption s-muted">
                {`${L.endedHint}${meetup.mine && meetup.cameCount !== null ? ` ${L.endedCame(meetup.cameCount)}` : ""}`}
              </p>
            </div>
          </div>
        </div>
        <div className="spot-card">
          <span className="o-t-label s-muted">{L.block}</span>
          <strong>{L.empty}</strong>
          <Button variant="secondary" icon="add" href="/app/spot/nouveau" data-testid="spot-ended-launch">
            {L.launchShort}
          </Button>
        </div>
      </div>
    );
  }

  const yes = replies?.items.filter((i) => i.answer === "yes") ?? [];
  const maybe = replies?.items.filter((i) => i.answer === "maybe") ?? [];
  return (
    <div className="spot-page" data-testid="spot-detail">
      <div className="spot-card">
        <div className="spot-card__head">
          <PersonAvatar url={meetup.author.avatarUrl} pseudo={meetup.author.pseudo} size={40} />
          <span className="spot-card__who">
            <strong className="o-never-truncate">
              {meetup.mine ? "Ton rendez-vous au spot" : L.from(meetup.author.pseudo)}
            </strong>
            <span className="o-t-caption spot-card__muted">
              {`${agoLabel(meetup.createdAt, now())} · ${spotUntilLabel(start, end)}`}
            </span>
          </span>
          <span className="spot-tag o-t-meta">{spotTimeLabel(start)}</span>
        </div>
        {meetup.place ? (
          <>
            <EventMap lat={meetup.place.lat} lng={meetup.place.lng} label={meetup.place.label} />
            <p className="spot-card__place">
              <Icon name="place" size={18} />
              <strong data-testid="spot-place">{meetup.place.label}</strong>
            </p>
          </>
        ) : null}
        {meetup.note ? <p className="spot-card__quote" data-testid="spot-note-text">{`« ${meetup.note} »`}</p> : null}
        <div data-testid="spot-who">
          <span className="o-t-label spot-card__muted">{L.who}</span>
          {meetup.yesCount + meetup.maybeCount === 0 ? (
            <p className="o-t-caption spot-card__muted">{L.nobodyYet}</p>
          ) : (
            <>
              <p>
                <strong>
                  {[
                    meetup.yesCount > 0 ? L.yesCount(meetup.yesCount) : null,
                    meetup.maybeCount > 0 ? L.maybeCount(meetup.maybeCount) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </strong>
              </p>
              <ul className="spot-people">
                {[...yes, ...maybe].map((r) => (
                  <li key={`${r.answer}-${r.person.pseudo}`} data-testid="spot-person">
                    <PersonAvatar url={r.person.avatarUrl} pseudo={r.person.pseudo} size={28} />
                    <span>{r.person.pseudo}</span>
                    <span className="o-t-caption spot-card__muted">{r.answer === "yes" ? L.yes : L.maybe}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {repliesError ? (
            <p className="o-t-caption" role="alert">
              {repliesError}
            </p>
          ) : null}
        </div>
        {meetup.mine ? null : (
          <div className="spot-card__two">
            {(["yes", "maybe"] as const).map((which) => (
              <Button
                key={which}
                variant={meetup.myAnswer === which ? "primary" : "secondary"}
                icon={which === "yes" ? "check" : "help"}
                disabled={answer.busy}
                aria-pressed={meetup.myAnswer === which}
                onClick={() => void answer.send(which)}
                data-testid={`spot-${which}`}
              >
                {which === "yes" ? L.yes : L.maybe}
              </Button>
            ))}
          </div>
        )}
        {answer.error ? (
          <p className="o-t-caption" role="alert">
            {answer.error}
          </p>
        ) : null}
      </div>
      {meetup.mine ? (
        confirming ? (
          <div className="spot-form" data-testid="spot-cancel-confirm">
            <p>{L.cancelConfirm}</p>
            <div className="spot-two">
              <Button
                variant="secondary"
                icon="trash"
                disabled={busy}
                onClick={() => void cancel()}
                data-testid="spot-cancel-yes"
              >
                Oui, annuler
              </Button>
              <Button
                variant="secondary"
                icon="back"
                disabled={busy}
                onClick={() => setConfirming(false)}
                data-testid="spot-cancel-no"
              >
                Non
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="secondary"
            icon="trash"
            fullWidth
            onClick={() => setConfirming(true)}
            data-testid="spot-cancel"
          >
            {L.cancel}
          </Button>
        )
      ) : null}
      {error ? (
        <p role="alert" data-testid="spot-error">
          {error}
        </p>
      ) : null}
      <p className="spot-note o-t-caption">
        <Icon name="lock" size={16} />
        <span>{L.privacy(spotEndLabel(start, end))}</span>
      </p>
    </div>
  );
}
