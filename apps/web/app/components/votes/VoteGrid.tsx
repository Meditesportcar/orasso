// La grille d'un vote, côté passionné (lots 57 et R7l3) : un candidat par carte (la mise en page du prix du public du lot 57, rien
// de changé), la mienne grisée « C'est toi », un candidat pas encore entré grisé « Pas encore entrée ». Toucher une carte vote
// (formulaire de la page) quand je peux voter ; sinon elle ne se touche pas. 4 colonnes dès 900 px (1280 px). Le classement,
// lui, vient de l'API (`VoteRanking`) : jamais d'ici.
import { Chip } from "@orasso/design-system/web";
import { votePassTexts as T, type VoteCandidate } from "@orasso/shared";

import "../../styles/passport.css";
import "../../styles/votes-pass.css";

export function VoteGrid({
  candidates,
  ownIds,
  myVote,
  canVote,
  busy,
  pick,
  onPick,
}: {
  candidates: readonly VoteCandidate[];
  ownIds: readonly string[];
  myVote: string | null;
  canVote: boolean;
  busy: boolean;
  /** La voiture choisie, pas encore votée. */
  pick: string | null;
  onPick: (applicationId: string) => void;
}) {
  if (candidates.length === 0) return <p className="s-muted">{T.empty}</p>;
  return (
    <ul className="vote-grid vote-grid--four" data-testid="vote-grid">
      {candidates.map((c, i) => {
        const own = ownIds.includes(c.applicationId);
        const waiting = !c.eligible;
        const chosen = pick === c.applicationId || (pick === null && myVote === c.applicationId);
        return (
          <li key={c.applicationId}>
            <button
              type="button"
              onClick={() => onPick(c.applicationId)}
              className="vote-card"
              aria-pressed={chosen}
              aria-label={
                own ? `${c.vehicleLabel}. ${T.you}` : waiting ? `${c.vehicleLabel}. ${T.notYetEntered}` : c.vehicleLabel
              }
              disabled={!canVote || own || waiting || busy}
              data-own={own ? "true" : undefined}
              data-testid={waiting ? "vote-candidate-waiting" : canVote ? "vote-candidate" : "vote-candidate-off"}
            >
              {c.photoUrl ? <img className="vote-card__photo" src={c.photoUrl} alt="" /> : null}
              <span className="o-t-caption s-muted">{T.number(i + 1)}</span>
              <strong className="o-never-truncate">{c.vehicleLabel}</strong>
              <span className="o-t-caption">{c.pseudo}</span>
              {own && <Chip>{T.you}</Chip>}
              {waiting && <Chip>{T.notYetEntered}</Chip>}
              {myVote === c.applicationId && <Chip variant="accent">{T.yourVote}</Chip>}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
