// Une entrée du fil du crew sur le site (lot R5c1, maquette R5.7 `.r5post`, `.r5auto`) : mêmes champs et mêmes mots
// que l'appli. Photos au format d'origine (D36), adresse protégée par l'appartenance au crew (cookie de session).
import { Icon } from "@orasso/design-system/web";
import {
  type CrewFeedItem,
  type CrewPollView,
  type CrewPostView,
  crewFeedLabels,
  crewFeedWhen,
  gradeLabels,
  pollShare,
} from "@orasso/shared";
import { useState } from "react";

import { now } from "../../lib/clock";
import { formatDateTime, formatDay } from "../../lib/format";
import { PersonAvatar } from "../People";
import { ReportDialog } from "../ReportDialog";

export const whenOf = (iso: string) => crewFeedWhen(new Date(iso), now(), formatDay(iso));

const MIN_RATIO = 4 / 5;
const MAX_RATIO = 1.91;
const ratioOf = (p: { width: number; height: number } | undefined) =>
  p && p.width > 0 && p.height > 0 ? Math.min(MAX_RATIO, Math.max(MIN_RATIO, p.width / p.height)) : 1;

function Photos({ post }: { post: CrewPostView }) {
  const [index, setIndex] = useState(0);
  const n = post.photos.length;
  const pseudo = post.author?.pseudo ?? crewFeedLabels.deletedAccount;
  return (
    <div className="cf-photos" style={{ aspectRatio: String(ratioOf(post.photos[0])) }} data-testid="crew-post-photos">
      <div
        className="cf-photos__track"
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          if (i !== index) setIndex(i);
        }}
      >
        {post.photos.map((p, i) => (
          <div key={p.id} className="cf-photos__slide">
            <img
              src={p.url}
              alt={crewFeedLabels.photoAlt(pseudo, i + 1, n)}
              width={p.width}
              height={p.height}
              loading="lazy"
            />
          </div>
        ))}
      </div>
      {n > 1 && (
        <span className="cf-photos__count" aria-hidden="true" data-testid="crew-post-photo-count">
          {crewFeedLabels.photoOf(index + 1, n)}
        </span>
      )}
    </div>
  );
}

function Poll({ poll, busy, onVote }: { poll: CrewPollView; busy: boolean; onVote: (id: string) => void }) {
  const results = poll.myOptionId !== null || !poll.open;
  return (
    <div className="cf-poll" data-testid="crew-poll">
      <p className="cf-poll__q">{poll.question}</p>
      {poll.options.map((o) => {
        const mine = o.id === poll.myOptionId;
        const share = pollShare(o.votes, poll.totalVotes);
        return (
          <button
            key={o.id}
            type="button"
            className="cf-poll__opt"
            aria-pressed={mine}
            disabled={!poll.open || busy || mine}
            onClick={() => onVote(o.id)}
            aria-label={
              results
                ? `${o.label}, ${crewFeedLabels.pollVotes(o.votes)}${mine ? `, ${crewFeedLabels.pollYourChoice}` : ""}`
                : crewFeedLabels.pollVoteFor(o.label)
            }
            data-testid="crew-poll-option"
          >
            {results && <span className="cf-poll__bar" style={{ width: `${share}%` }} aria-hidden="true" />}
            <span className="cf-poll__dot" aria-hidden="true">
              {mine && <Icon name="check" size={12} />}
            </span>
            <span className="cf-poll__label">{o.label}</span>
            {results && <span className="cf-poll__share">{`${share} %`}</span>}
          </button>
        );
      })}
      <div className="cf-poll__foot">
        <span>{crewFeedLabels.pollVotes(poll.totalVotes)}</span>
        {poll.myOptionId && <strong>{crewFeedLabels.pollYourChoice}</strong>}
        {!poll.open ? (
          <strong data-testid="crew-poll-closed">{crewFeedLabels.pollClosed}</strong>
        ) : (
          poll.endsAt && <span>{crewFeedLabels.pollEndsOn(formatDateTime(poll.endsAt))}</span>
        )}
      </div>
    </div>
  );
}

export function PostCard({
  post,
  busy,
  onFire,
  onComments,
  onVote,
  onRemove,
  onClosePoll,
}: {
  post: CrewPostView;
  busy: boolean;
  onFire: () => void;
  onComments: () => void;
  onVote: (optionId: string) => void;
  onRemove: () => void;
  onClosePoll: () => void;
}) {
  const pseudo = post.author?.pseudo ?? crewFeedLabels.deletedAccount;
  return (
    <article className="cf-post" data-testid="crew-post">
      <div className="cf-post__head">
        <PersonAvatar url={post.author?.avatarUrl ?? null} pseudo={pseudo} size={38} />
        <span className="cf-post__who">
          <b>{pseudo}</b>
          <small>{whenOf(post.createdAt)}</small>
        </span>
        <details className="cf-menu">
          <summary aria-label={crewFeedLabels.more} data-testid="crew-post-more">
            <Icon name="more" size={20} />
          </summary>
          <div className="cf-menu__list">
            {!post.mine && <ReportDialog look="link" targetType="crew_post" targetId={post.id} />}
            {post.poll?.canClose && (
              <button
                type="button"
                className="cf-link"
                onClick={onClosePoll}
                disabled={busy}
                data-testid="crew-poll-close"
              >
                <Icon name="lock" size={16} />
                {crewFeedLabels.pollClose}
              </button>
            )}
            {post.canRemove && (
              <button
                type="button"
                className="cf-link"
                onClick={onRemove}
                disabled={busy}
                data-testid="crew-post-remove"
              >
                <Icon name="trash" size={16} />
                {crewFeedLabels.remove}
              </button>
            )}
          </div>
        </details>
      </div>
      {post.photos.length > 0 && <Photos post={post} />}
      {post.text && (
        <p className="cf-post__text" data-testid="crew-post-text">
          {post.text}
        </p>
      )}
      {post.poll && <Poll poll={post.poll} busy={busy} onVote={onVote} />}
      {(post.vehicle || post.event) && (
        <div className="cf-pills">
          {post.vehicle && (
            <span className="cf-pill" data-testid="crew-post-vehicle">
              <Icon name={post.vehicle.vehicleType === "moto" ? "moto" : "vehicle"} size={14} />
              {post.vehicle.label}
            </span>
          )}
          {post.event && (
            <a className="cf-pill" href={`/e/${post.event.slug}`}>
              <Icon name="calendar" size={14} />
              {post.event.title}
            </a>
          )}
        </div>
      )}
      <div className="cf-rx">
        <button
          type="button"
          className="cf-rx__btn"
          aria-pressed={post.firedByMe}
          aria-label={post.firedByMe ? crewFeedLabels.fireOn(post.firesCount) : crewFeedLabels.fireOff(post.firesCount)}
          onClick={onFire}
          disabled={busy}
          data-testid="crew-post-fire"
        >
          <Icon name="fire" size={17} />
          <span>{post.firesCount}</span>
        </button>
        <button
          type="button"
          className="cf-rx__btn"
          aria-label={crewFeedLabels.openComments(post.commentsCount)}
          onClick={onComments}
          data-testid="crew-post-comments"
        >
          <Icon name="chat" size={17} />
          <span>{post.commentsCount}</span>
        </button>
        <span className="cf-rx__cap">{crewFeedLabels.commentsCount(post.commentsCount)}</span>
      </div>
    </article>
  );
}

export function AutoCard({ item }: { item: Exclude<CrewFeedItem, { type: "post" }> }) {
  if (item.type === "member_joined") {
    return (
      <div className="cf-auto" data-testid="crew-auto">
        <span className="cf-auto__icon" aria-hidden="true">
          <Icon name="crew" size={20} />
        </span>
        <span>
          <b>{crewFeedLabels.autoJoined(item.person.pseudo)}</b>
          <small>
            {[item.vehicleLabel, `grade ${gradeLabels[item.person.grade]}`, whenOf(item.at)]
              .filter(Boolean)
              .join(" · ")}
          </small>
        </span>
      </div>
    );
  }
  return (
    <a className="cf-auto" href={`/e/${item.event.slug}`} data-testid="crew-auto">
      <span className="cf-auto__icon" aria-hidden="true">
        <Icon name="ticket" size={20} />
      </span>
      <span>
        <b>{crewFeedLabels.autoAccepted(item.event.title)}</b>
        <small>{[crewFeedLabels.autoAcceptedMembers(item.members), formatDay(item.event.startsAt)].join(" · ")}</small>
      </span>
    </a>
  );
}
