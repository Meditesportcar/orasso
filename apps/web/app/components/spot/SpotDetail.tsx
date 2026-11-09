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
import { useEffect, useRef, useState } from "react";

import { apiFetch } from "../../lib/api.client";
import { now } from "../../lib/clock";
import { EventMap } from "../EventMap";
import { PersonAvatar } from "../People";
import { useSpotAnswer } from "./useSpotAnswer";
import { useSpotOver } from "./useSpotOver";
import "../../styles/spot.css";

/** Refus définitif de l'API : annulé, plus invité, compte écarté (404), ou accès refusé (403). Pas une panne. */
const refusedStatus = (status: number) => status === 404 || status === 403;

export function SpotDetail({ initial }: { initial: SpotMeetupView }) {
  // `null` : refus définitif appris pendant que la page est ouverte (annulé, plus invité). Le rendez-vous et les réponses sont
  // vidés, jamais l'ancienne donnée devant l'erreur : le lieu ne reste pas à l'écran.
  const [state, setState] = useState<SpotMeetupView | null>(initial);
  useEffect(() => setState(initial), [initial]);
  if (state === null) {
    return (
      <div className="spot-page" data-testid="spot-gone">
        <p role="alert">{L.unavailable}</p>
        <Button variant="secondary" icon="add" href="/app/spot/nouveau" data-testid="spot-gone-launch">
          {L.launch}
        </Button>
      </div>
    );
  }
  return <Meetup meetup={state} onChange={setState} onRefused={() => setState(null)} />;
}

function Meetup({
  meetup,
  onChange: setMeetup,
  onRefused,
}: {
  meetup: SpotMeetupView;
  onChange: (v: SpotMeetupView) => void;
  onRefused: () => void;
}) {
  const answer = useSpotAnswer(meetup, setMeetup, onRefused);
  // Fini pour l'heure du site, même sans réseau : lieu, liste et réponses disparaissent à `endsAt`.
  const over = useSpotOver(meetup);
  const start = new Date(meetup.startsAt);
  const end = new Date(meetup.endsAt);
  const [replies, setReplies] = useState<SpotReplies | null>(null);
  const [more, setMore] = useState<SpotReplies["items"]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [repliesError, setRepliesError] = useState<string | null>(null);
  const firstPageKey = useRef<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // La liste se relit à chaque nouvelle vue du rendez-vous (relecture, réponse), pas seulement quand les compteurs changent :
  // Alice qui part et Bob qui arrive laissent le total inchangé.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `meetup` (la vue) est la révision à suivre.
  useEffect(() => {
    if (over) return;
    let alive = true;
    void apiFetch<SpotReplies>(`/spot-meetups/${meetup.id}/replies`).then((res) => {
      if (!alive) return;
      if (res.ok) {
        // Les pages déjà chargées par « Voir plus » restent tant que les compteurs et la première page ne changent pas.
        const key = JSON.stringify([meetup.yesCount, meetup.maybeCount, res.data]);
        if (key !== firstPageKey.current) {
          firstPageKey.current = key;
          setReplies(res.data);
          setMore([]);
          setCursor(res.data.nextCursor);
        }
        setRepliesError(null);
      } else if (refusedStatus(res.status)) onRefused();
      else setRepliesError(res.error.message);
    });
    return () => {
      alive = false;
    };
  }, [meetup, over]);

  // Fini : la liste n'existe plus, ni à l'écran ni en mémoire.
  useEffect(() => {
    if (!over) return;
    firstPageKey.current = null;
    setReplies(null);
    setMore([]);
    setCursor(null);
  }, [over]);

  async function loadMore() {
    if (!cursor || moreBusy) return;
    setMoreBusy(true);
    const res = await apiFetch<SpotReplies>(`/spot-meetups/${meetup.id}/replies?cursor=${encodeURIComponent(cursor)}`);
    if (res.ok) {
      setMore((m) => [...m, ...res.data.items]);
      setCursor(res.data.nextCursor);
    } else if (refusedStatus(res.status)) onRefused();
    else setRepliesError(res.error.message);
    setMoreBusy(false);
  }

  // Relu toutes les 30 s tant qu'il dure (comme l'appli) : la fin efface le lieu à l'écran, un refus vide la page.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `onRefused` et `setMeetup` sont stables pour cette page.
  useEffect(() => {
    if (over) return;
    const timer = window.setInterval(() => {
      void apiFetch<SpotMeetupView>(`/spot-meetups/${meetup.id}`).then((res) => {
        if (res.ok) setMeetup(res.data);
        else if (refusedStatus(res.status)) onRefused();
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

  const items = replies ? [...replies.items, ...more] : [];
  const yes = items.filter((i) => i.answer === "yes");
  const maybe = items.filter((i) => i.answer === "maybe");
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
            <EventMap lat={meetup.place.lat} lng={meetup.place.lng} label={meetup.place.label} zoom={16} />
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
              {cursor ? (
                <Button
                  variant="secondary"
                  icon="down"
                  disabled={moreBusy}
                  onClick={() => void loadMore()}
                  data-testid="spot-who-more"
                >
                  Voir plus
                </Button>
              ) : null}
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
