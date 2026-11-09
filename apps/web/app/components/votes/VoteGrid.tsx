// La grille d'un vote, côté passionné (lot R7l3) : un candidat par carte, la mienne grisée « C'est toi », un candidat pas encore
// entré grisé « Pas encore entrée ». Toucher une carte vote (formulaire de la page) quand je peux voter ; sinon elle ne
// se touche pas. Le classement, lui, vient de l'API (`VoteRanking`) : jamais d'ici.
import { Chip } from "@orasso/design-system/web";
import { votePassTexts as T, type VoteCandidate } from "@orasso/shared";

import "../../styles/votes-pass.css";

export function VoteGrid({
  candidates,
  ownIds,
  myVote,
  canVote,
  busy,
}: {
  candidates: readonly VoteCandidate[];
  ownIds: readonly string[];
  myVote: string | null;
  canVote: boolean;
  busy: boolean;
}) {
  if (candidates.length === 0) return <p className="s-muted">{T.empty}</p>;
  return (
    <ul className="vp-grid" data-testid="vote-grid">
      {candidates.map((c, i) => {
        const own = ownIds.includes(c.applicationId);
        const waiting = !c.eligible;
        const chosen = myVote === c.applicationId;
        return (
          <li key={c.applicationId}>
            <button
              type="submit"
              name="applicationId"
              value={c.applicationId}
              className={`vp-card${own ? " is-own" : ""}${waiting ? " is-waiting" : ""}`}
              aria-pressed={chosen}
              aria-label={
                own
                  ? `${c.vehicleLabel}. ${T.you}`
                  : waiting
                    ? `${c.vehicleLabel}. ${T.notYetEntered}`
                    : T.pickCta(c.vehicleLabel)
              }
              disabled={!canVote || own || waiting || busy}
              data-testid={
                own
                  ? "vote-candidate-own"
                  : waiting
                    ? "vote-candidate-waiting"
                    : canVote
                      ? "vote-candidate"
                      : "vote-candidate-off"
              }
            >
              {c.photoUrl ? (
                <img className="vp-card__photo" src={c.photoUrl} alt="" />
              ) : (
                <span className="vp-card__photo" />
              )}
              <span className="vp-card__tag">{own ? T.youTag : waiting ? T.notYetEntered : T.number(i + 1)}</span>
              <span className="vp-card__body">
                <strong className="o-never-truncate">{c.vehicleLabel}</strong>
                <small>{own ? T.you : waiting ? T.notYetEntered : c.pseudo}</small>
                {chosen ? <Chip variant="accent">{T.yourVote}</Chip> : null}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
