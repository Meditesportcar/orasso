// Le classement d'un vote, côté passionné (lot R7l3, maquette `vs_post` et `vr_res`) : rang, voiture, barre, voix ; le premier
// sur l'aplat crème ; ma voiture cerclée. Servi par l'API seulement (voix donnée, clôture, équipe) : jamais reconstruit ici.
import { myRankIn, rankingBarPercent, votePassTexts as T, type VoteRankingEntry, type VoteView } from "@orasso/shared";

import "../../styles/votes-pass.css";

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
        {closed ? null : (
          <span className="o-t-caption" data-testid="vote-live">{`${T.live} · ${T.votes(vote.total)}`}</span>
        )}
      </div>
      {me ? (
        <p className="o-t-caption" data-testid="vote-my-rank">
          {T.rank(me.rank, me.of)}
        </p>
      ) : null}
      <ol className="vp-rank">
        {entries.slice(0, 10).map((e, i) => {
          const own = vote.ownApplicationIds.includes(e.applicationId);
          const mine = vote.myVote === e.applicationId;
          const first = i === 0 && e.votes > 0;
          return (
            <li
              key={e.applicationId}
              className={`vp-rank__row${first ? " is-first" : ""}${own || mine ? " is-mine" : ""}`}
              data-testid="vote-board-row"
            >
              <span className="o-t-number-narrow">{e.rank}</span>
              <span>
                <b className="o-never-truncate">{e.vehicleLabel}</b>
                <br />
                <small>{own ? `${e.pseudo} · ${T.you}` : mine ? `${e.pseudo} · ${T.yourVote}` : e.pseudo}</small>
                <span className="vp-rank__bar">
                  <span style={{ width: `${rankingBarPercent(e.votes, top)}%` }} />
                </span>
              </span>
              <span className="o-t-number">{e.votes}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
