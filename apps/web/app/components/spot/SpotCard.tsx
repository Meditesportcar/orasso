// La carte d'un rendez-vous au spot sur le site (maquette R7.9), commune au bloc « Au spot » de l'Accueil, à la carte du Fil et
// à l'onglet Spots du crew ; mêmes mots et mêmes règles que l'appli (`features/spot/SpotCard.tsx`). Le lieu n'est servi que
// s'il l'est par l'API : fini, la carte dit « terminé » sans lieu. Les réponses passent par l'API, la vue revient d'elle.
import { Button, Icon } from "@orasso/design-system/web";
import { agoLabel, spotLabels as L, type SpotMeetupView, spotTimeLabel, spotUntilLabel } from "@orasso/shared";
import { useEffect, useState } from "react";

import { now } from "../../lib/clock";
import { PersonAvatar } from "../People";
import { useSpotAnswer } from "./useSpotAnswer";
import "../../styles/spot.css";

export function SpotCard({
  meetup: initial,
  bare = false,
  testid = "spot-card",
  onChange,
}: {
  meetup: SpotMeetupView;
  /** Dans un bloc ou une carte qui a déjà son cadre. */
  bare?: boolean;
  testid?: string;
  onChange?: (view: SpotMeetupView) => void;
}) {
  const [meetup, setMeetup] = useState(initial);
  useEffect(() => setMeetup(initial), [initial]);
  const answer = useSpotAnswer(meetup, (view) => {
    setMeetup(view);
    onChange?.(view);
  });
  const over = meetup.phase === "ended";
  const start = new Date(meetup.startsAt);
  const end = new Date(meetup.endsAt);
  const href = `/app/spot/${meetup.id}`;
  const sub = over ? L.ended : `${agoLabel(meetup.createdAt, now())} · ${spotUntilLabel(start, end)}`;
  const who = L.whoCome(
    meetup.yesPreview.map((p) => p.pseudo),
    meetup.yesCount,
    meetup.maybeCount,
  );
  return (
    <article className={bare ? "spot-card spot-card--bare" : "spot-card"} data-testid={testid}>
      <a className="spot-card__head" href={href} data-testid={`${testid}-open`}>
        <PersonAvatar url={meetup.author.avatarUrl} pseudo={meetup.author.pseudo} size={40} />
        <span className="spot-card__who">
          <strong className="o-never-truncate">{L.from(meetup.author.pseudo)}</strong>
          <span className="o-t-caption spot-card__muted">{sub}</span>
        </span>
        {over ? null : <span className="spot-tag o-t-meta">{spotTimeLabel(start)}</span>}
      </a>
      {meetup.place ? (
        <p className="spot-card__place" data-testid={`${testid}-place`}>
          <Icon name="place" size={18} />
          <strong>{meetup.place.label}</strong>
        </p>
      ) : null}
      {meetup.note ? <p className="spot-card__quote">{`« ${meetup.note} »`}</p> : null}
      {over ? (
        <p className="o-t-caption spot-card__muted">{L.endedHint}</p>
      ) : (
        <>
          <p className="spot-card__wholine" data-testid={`${testid}-who`}>
            <span className="o-t-label spot-card__muted">{L.who}</span>
            <span className="o-t-caption">{who || L.nobodyYet}</span>
          </p>
          {meetup.mine ? (
            <Button variant="secondary" icon="next" href={href} fullWidth data-testid={`${testid}-mine`}>
              {L.open}
            </Button>
          ) : (
            <div className="spot-card__two">
              {(["yes", "maybe"] as const).map((which) => (
                <Button
                  key={which}
                  variant={meetup.myAnswer === which ? "primary" : "secondary"}
                  icon={which === "yes" ? "check" : "help"}
                  disabled={answer.busy}
                  aria-pressed={meetup.myAnswer === which}
                  onClick={() => void answer.send(which)}
                  data-testid={`${testid}-${which}`}
                >
                  {which === "yes" ? L.yes : L.maybe}
                </Button>
              ))}
            </div>
          )}
          {answer.error ? (
            <p className="o-t-caption spot-card__error" role="alert" data-testid={`${testid}-error`}>
              {answer.error}
            </p>
          ) : null}
        </>
      )}
    </article>
  );
}
