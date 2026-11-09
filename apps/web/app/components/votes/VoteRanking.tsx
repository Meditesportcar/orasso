// Le classement d'un vote, côté passionné (lots 57 et R7l3) : rang, voiture, barre, voix (la mise en page du prix du public du
// lot 57). Servi par l'API seulement (voix donnée, clôture, équipe) : jamais reconstruit ici.
import { Chip } from "@orasso/design-system/web";
import { myRankIn, votePassTexts as T, type VoteRankingEntry, type VoteView } from "@orasso/shared";

import "../../styles/passport.css";

export function VoteRanking({
  vote,
  entries,
  closed,
}: {
  vote: VoteView;
  entries: readonly VoteRankingEntry[];
  closed: boolean;
}) {
  const top = entries[0]?.votes ?? 0;
  const me = myRankIn(vote);
  return (
    <section className="s-stack s-stack--tight" aria-labelledby="vote-ranking" data-testid="vote-ranking">
      <div className="s-row s-row--between">
        <h2 id="vote-ranking" className="s-h2">
          {closed ? "Résultats" : T.ranking}
        </h2>
        {!closed && (
          <span data-testid="vote-live">
            <Chip>{T.live}</Chip>
          </span>
        )}
      </div>
      <p className="o-t-caption s-muted" data-testid="vote-total">
        {T.votes(vote.total)}
        {me ? ` · ${T.rank(me.rank, me.of)}` : ""}
      </p>
      <ol className="vote-rank">
        {entries.slice(0, 10).map((e) => {
          const own = vote.ownApplicationIds.includes(e.applicationId);
          return (
            <li key={e.applicationId} data-testid="vote-board-row">
              <span className="o-t-number-narrow">{e.rank}</span>
              <span className="o-never-truncate">
                {e.vehicleLabel} <span className="s-muted">· {own ? `${e.pseudo} · ${T.you}` : e.pseudo}</span>
                <span
                  className="vote-bar"
                  style={{ width: `${top && e.votes ? Math.max(4, (e.votes / top) * 100) : 0}%` }}
                />
              </span>
              <span className="o-t-caption">{T.votes(e.votes)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
