// La liste des votes d'un événement, côté passionné (lot R7l3, maquette R7.17 `vs_list`) : une ligne par vote avec son état
// (« Voté », « Voter », « À venir », « Résultats »), la carte « Résultat » d'un vote clos, et les deux notes de bas de page.
import { Icon } from "@orasso/design-system/web";
import { openVotesIn, votePassTexts as T, type VoteView, voteResultCard, voteRow } from "@orasso/shared";

import "../../styles/votes-pass.css";

/** Le titre de la liste : « Votes · 3 ouverts », ou « Votes ». */
export function votesHeading(items: readonly Pick<VoteView, "state">[]): string {
  const open = openVotesIn(items);
  return open > 0 ? T.listOpen(open) : T.listTitle;
}

export function VoteRows({
  items,
  now,
  slug,
  back,
}: {
  items: readonly VoteView[];
  now: Date;
  slug: string;
  back: string;
}) {
  return (
    <>
      <ul className="vp-list" data-testid="votes-list">
        {items.map((v) => {
          const row = voteRow(v, now);
          const podium = voteResultCard(v);
          const href = `/app/vote/${slug}?vote=${v.id}&retour=${encodeURIComponent(back)}`;
          const head = (
            <>
              <span className={v.kind === "all_categories" && !row.muted ? "vp-round is-acc" : "vp-round"}>
                <Icon name={v.kind === "all_categories" ? "trophy" : "flag"} />
              </span>
              <span className="vp-row__text">
                <b className="o-never-truncate" data-testid={`votes-title-${v.id}`}>
                  {v.title}
                </b>
                <small data-testid={`votes-detail-${v.id}`}>{row.detail}</small>
              </span>
              <span className="vp-chip" data-testid={`votes-chip-${v.id}`}>
                <Icon name={row.chipIcon === "chevron" ? "next" : row.chipIcon} size={14} />
                {row.chip}
              </span>
            </>
          );
          return (
            <li
              key={v.id}
              className={`vp-row${row.hot ? " is-hot" : ""}${row.muted ? " is-muted" : ""}`}
              data-testid={`votes-row-${v.id}`}
            >
              {row.muted ? (
                <div className="vp-row__head" aria-disabled="true">
                  {head}
                </div>
              ) : (
                <a className="vp-row__head" href={href} aria-label={`${v.title} : ${row.detail}`}>
                  {head}
                </a>
              )}
              {podium ? (
                <div className="vp-result" data-testid={`votes-result-${v.id}`}>
                  <span className="o-t-label s-muted">{T.resultTitle}</span>
                  {podium.map((p) => (
                    <div key={p.rank} className="vp-result__row">
                      <b>{T.podium[p.rank - 1]}</b>
                      <span className="o-never-truncate">{p.label}</span>
                      <span className="o-t-caption s-muted">{T.resultVotes(p.votes)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {items.length > 0 ? (
        <div className="vp-notes">
          <p className="vp-note">
            <Icon name="lock" size={18} />
            <span>
              {T.ruleNote} {T.rankingNote}
            </span>
          </p>
          <p className="vp-note">
            <Icon name="place" size={18} />
            <span>{T.whoVotes}</span>
          </p>
        </div>
      ) : null}
    </>
  );
}
