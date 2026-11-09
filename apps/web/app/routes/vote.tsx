// Un vote (lots 57, R7-0 et R7l3, parité de l'appli `/vote/<événement>?vote=`) : la grille des candidats d'un vote à thème ou de
// « Toutes catégories » (comme dans l'appli : on **choisit** une voiture, puis « Voter pour … » ; une voix, modifiable jusqu'à
// la clôture par le même geste en deux temps, jamais pour soi), un candidat
// pas encore entré grisé, puis le classement, **montré seulement après la voix** (à tous après la clôture, à l'équipe
// toujours). Les règles sont toutes dans l'API : la page affiche ce qu'elle a servi (`ranking: null` + raison), elle n'en
// déduit rien. Sans `vote` dans l'adresse : « Toutes catégories » (anciens liens et notifications).
import { Button, Plate } from "@orasso/design-system/web";
import {
  audiencePrizeTexts,
  rankingHiddenLine,
  votePassTexts as T,
  VOTE_CLOSING_SOON_MIN,
  VOTE_RELOAD_JITTER_MS,
  voteBlockedLine,
  voteMinutesLeft,
  voteResultCard,
  voteScreenMode,
  voteScreenTexts,
} from "@orasso/shared";
import { useEffect, useState } from "react";
import { Form, useNavigation, useRevalidator } from "react-router";

import { FicheBar, ficheHandle } from "../components/FicheBar";
import { useClosingWatch, useOrassoNow } from "../components/votes/useVoteClock";
import { VoteGrid } from "../components/votes/VoteGrid";
import { VoteRanking } from "../components/votes/VoteRanking";
import { confirmationIsStale, eventAfterVote } from "../components/votes/voteFallback";
import { useLiveRevalidate } from "../lib/useLiveRevalidate";
import { loadVote, voteAction } from "../lib/vote.server";
import type { Route } from "./+types/vote";
import "../styles/passport.css";
import "../styles/votes-pass.css";

// Lot M7 : fiche ou parcours, mode B (en-tête de fiche, sans bande ni barre d'onglets).
export const handle = ficheHandle;

export function meta({ loaderData: d }: Route.MetaArgs) {
  return [
    { title: `${d?.vote?.title ?? T.voteScreenTitle}${d?.event ? ` · ${d.event.title}` : ""} · Orasso` },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  return loadVote(request, params.slug);
}

export async function action({ request }: Route.ActionArgs) {
  return voteAction(request);
}

export default function Vote({ loaderData, actionData }: Route.ComponentProps) {
  const { candidates, candidatesComplete, back } = loaderData;
  const busy = useNavigation().state !== "idle";
  const revalidator = useRevalidator();
  // La voix qui vient de réussir (réponse de l'API, avec le classement que j'ai maintenant le droit de voir) sert tant que la
  // relecture n'est pas revenue.
  const justVoted = actionData?.ok ? actionData.vote : null;
  const vote = loaderData.vote ?? justVoted;
  // L'événement ne s'est pas relu (panne passagère) mais la voix a réussi : la confirmation reste, avec « Réessayer ».
  const event = eventAfterVote(loaderData.event, actionData, loaderData.slug, justVoted);
  // Le compte à rebours avance seul (rendu toutes les 30 s), sans attendre un message du canal.
  const now = useOrassoNow();
  // Le geste en deux temps (parité avec l'appli) : la voiture choisie dans la grille, et la grille rouverte pour changer sa voix.
  const [pick, setPick] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  // Une voix qui réussit referme le choix : on revoit le classement, la grille ne revient que par « Changer mon vote ».
  useEffect(() => {
    if (actionData?.ok) {
      setPick(null);
      setChanging(false);
    }
  }, [actionData]);
  // La relecture a échoué après ma voix : la réponse à la voix reste affichée, avec « Réessayer ».
  const stale = confirmationIsStale(loaderData, justVoted);
  // Clôture : à l'échéance du serveur, la page se relit (et réessaie jusqu'à la clôture confirmée) ; surveillée tant que le
  // vote n'est pas fini, ouvert ou pas encore.
  useClosingWatch(vote, loaderData.serverAt);
  // Grille et classement en direct : un message utile de CE vote recharge la page, au plus une fois toutes les 10 s, et le canal
  // qui revient après une coupure la recharge aussi.
  const voteId = vote?.id ?? null;
  const { connected } = useLiveRevalidate(
    event ? `event:${event.id}:votes` : null,
    (m) => {
      if (
        m.type !== "votes.changed" &&
        m.type !== "theme_votes.changed" &&
        m.type !== "votes.opened" &&
        m.type !== "votes.closed" &&
        m.type !== "votes.candidates.changed"
      )
        return false;
      const id = (m.payload as { voteId?: unknown } | null)?.voteId;
      return voteId === null || typeof id !== "string" || id === voteId;
    },
    { jitterMs: VOTE_RELOAD_JITTER_MS },
  );

  // Relecture impossible (panne passagère) : la confirmation de la voix reste affichée avec « Réessayer » ; jamais un
  // retour à la connexion ni un écran d'erreur pour une panne.
  if (!vote || !event) {
    return (
      <div className="s-stack" data-testid="vote" data-live={connected ? "on" : "off"}>
        <FicheBar title={vote?.title ?? T.voteScreenTitle} facts={event?.title || undefined} back={back} />
        <p className="s-error" role="alert" data-testid="vote-ranking-failed">
          {T.loadFailed}
        </p>
        <Button
          variant="secondary"
          icon="undo"
          onClick={() => void revalidator.revalidate()}
          data-testid="vote-ranking-retry"
        >
          {T.retry}
        </Button>
        <Button variant="secondary" icon="calendar" href={`/e/${event?.slug ?? loaderData.slug}`}>
          {T.seeEvent}
        </Button>
      </div>
    );
  }

  const mode = voteScreenMode(vote, changing);
  const closesAt = new Date(vote.closesAt);
  const left = vote.state === "open" ? voteMinutesLeft(vote.closesAt, now) : null;
  const until = vote.state === "open" ? audiencePrizeTexts.openUntil(closesAt, now) : null;
  const podium = voteResultCard(vote);
  // Grille : pour choisir, ou (désactivée) pour voir pourquoi on ne peut pas voter ; une fois voté, seulement via « Changer mon vote ».
  const showGrid = mode === "choose" || mode === "blocked" || mode === "upcoming";
  const pickedCandidate = candidates.find((c) => c.applicationId === pick) ?? null;

  return (
    <div className="s-stack" data-testid="vote" data-live={connected ? "on" : "off"}>
      <FicheBar title={vote.title} facts={event.title || undefined} back={back} />
      <p className="s-lead" data-testid="vote-lead">
        {mode === "closed"
          ? vote.settled
            ? voteScreenTexts.results
            : audiencePrizeTexts.closed
          : until
            ? left !== null && left <= VOTE_CLOSING_SOON_MIN
              ? `${T.minutesLeft(left)} · ${until}`
              : until
            : T.notOpen}
        {vote.checkedInAt ? ` · ${audiencePrizeTexts.checkedInAt(new Date(vote.checkedInAt))}` : ""}
      </p>

      {stale && (
        <>
          <p className="s-error" role="alert" data-testid="vote-ranking-failed">
            {T.refreshFailed}
          </p>
          <Button
            variant="secondary"
            icon="undo"
            onClick={() => void revalidator.revalidate()}
            data-testid="vote-ranking-retry"
          >
            {T.retry}
          </Button>
        </>
      )}
      {actionData?.error && (
        <p className="s-error" role="alert">
          {actionData.error}
        </p>
      )}
      {vote.myVote && vote.state === "open" && !changing && (
        <p className="s-notice s-notice--ok" role="status" data-testid="vote-saved">
          {voteScreenTexts.saved(closesAt, now)}
        </p>
      )}
      {mode === "blocked" && (
        <p className="s-notice" data-testid="vote-reason">
          {voteBlockedLine(vote)}
        </p>
      )}
      {mode === "upcoming" && (
        <p className="s-notice" data-testid="vote-reason">
          {T.notOpen}
        </p>
      )}
      {mode === "closed" && (
        <p className="s-notice" data-testid="vote-reason">
          {T.closedNote}
        </p>
      )}
      {mode === "voted" && (
        <div className="s-row">
          <Button variant="secondary" icon="undo" onClick={() => setChanging(true)} data-testid="vote-change">
            {T.change}
          </Button>
        </div>
      )}
      {mode === "choose" && changing && (
        <div className="s-row">
          <Button
            variant="secondary"
            icon="back"
            onClick={() => {
              setPick(null);
              setChanging(false);
            }}
            data-testid="vote-back"
          >
            {T.backToRanking}
          </Button>
        </div>
      )}

      {mode === "closed" && podium?.[0] && vote.ranking?.[0] && (
        <Plate className="s-stack s-stack--tight" data-testid="vote-winner">
          <div className="o-t-label">{T.winnerLine(vote.ranking[0].votes, vote.total).toUpperCase()}</div>
          <div className="vp-winner">
            {vote.ranking[0].photoUrl ? <img src={vote.ranking[0].photoUrl} alt="" /> : null}
            <span>
              <strong className="o-never-truncate">{vote.ranking[0].vehicleLabel}</strong>
              <br />
              <small>{vote.ranking[0].pseudo}</small>
            </span>
          </div>
        </Plate>
      )}
      {mode === "closed" && !podium && vote.ranking && (
        <p className="o-t-caption s-muted" data-testid="vote-no-podium">
          {T.noPodium}
        </p>
      )}

      {showGrid && (
        <section className="s-stack s-stack--tight" aria-labelledby="vote-grid">
          <h2 id="vote-grid" className="s-h2">
            {T.oneVote}
          </h2>
          <p className="o-t-caption s-muted">{T.rulesLine}</p>
          {!candidatesComplete && (
            <>
              <p className="s-error" role="alert" data-testid="vote-grid-failed">
                {T.gridLoadFailed}
              </p>
              <Button
                variant="secondary"
                icon="undo"
                onClick={() => void revalidator.revalidate()}
                data-testid="vote-grid-retry"
              >
                {T.retry}
              </Button>
            </>
          )}
          <Form method="post">
            <input type="hidden" name="eventId" value={event.id} />
            <input type="hidden" name="voteId" value={vote.id} />
            <input type="hidden" name="applicationId" value={pick ?? ""} />
            <VoteGrid
              candidates={candidates}
              failed={!candidatesComplete}
              ownIds={vote.ownApplicationIds}
              myVote={vote.myVote}
              canVote={vote.canVote}
              busy={busy}
              pick={pick}
              onPick={setPick}
            />
            {mode === "choose" && (
              <div className="vp-cta" data-testid="vote-cta-bar">
                <Button
                  type="submit"
                  icon="trophy"
                  fullWidth
                  disabled={!pickedCandidate || busy}
                  data-testid="vote-cta"
                >
                  {pickedCandidate ? T.pickCta(pickedCandidate.vehicleLabel) : T.chooseCta}
                </Button>
              </div>
            )}
          </Form>
        </section>
      )}

      {/* Le classement n'est pas servi : la phrase qui dit quand il le sera (raison de l'API, jamais déduite ici). */}
      {vote.ranking === null && mode !== "closed" && (
        <p className="s-notice" data-testid="vote-ranking-hidden">
          {rankingHiddenLine(vote)}
        </p>
      )}
      {vote.ranking && !(mode === "choose" && changing) && (
        <VoteRanking vote={vote} entries={vote.ranking} closed={mode === "closed"} />
      )}

      <div className="s-row">
        <Button variant="secondary" icon="flag" href={`/app/votes/${event.slug}?retour=${encodeURIComponent(back)}`}>
          {T.seeAllVotes}
        </Button>
        <Button variant="secondary" icon="calendar" href={`/e/${event.slug}`}>
          {T.seeEvent}
        </Button>
      </div>
    </div>
  );
}
