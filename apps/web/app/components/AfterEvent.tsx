// Espace organisateur, « Jour J et après » : avis et droit de réponse, contestations de malus (docs/02, espace
// organisateur ; docs/01 « après l'événement »). Lot 12.
import { Button, Chip } from "@orasso/design-system/web";
import {
  type ContestStatus,
  contestStatusLabels,
  type EventReview,
  type EventReviews,
  type MalusContestView,
} from "@orasso/shared";
import { useState } from "react";

import { apiFetch } from "../lib/api.client";
import { formatDateTime } from "../lib/format";
import { Stars } from "./Stars";

export function AfterEvent({
  reviews: initialReviews,
  contests: initialContests,
}: {
  reviews: EventReviews | null;
  contests: MalusContestView[];
}) {
  const [reviews, setReviews] = useState(initialReviews);
  const [contests, setContests] = useState(initialContests);
  const average = reviews?.average?.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  return (
    <>
      <section className="orga__panel s-stack" aria-labelledby="orga-avis" data-testid="orga-reviews">
        <h2 className="s-h2" id="orga-avis">
          Avis · {reviews?.count ?? 0}
          {average ? ` · moyenne ${average} / 3` : ""}
        </h2>
        {!reviews || reviews.count === 0 ? (
          <p className="s-muted">
            Les participants pointés peuvent noter l'événement pendant la semaine qui suit sa fin.
          </p>
        ) : (
          <ul className="s-reviews">
            {reviews.items.map((r) => (
              <ReviewItem
                key={r.id}
                review={r}
                onReplied={(updated) =>
                  setReviews((cur) =>
                    cur ? { ...cur, items: cur.items.map((i) => (i.id === updated.id ? updated : i)) } : cur,
                  )
                }
              />
            ))}
          </ul>
        )}
      </section>

      <section className="orga__panel s-stack" aria-labelledby="orga-contest" data-testid="orga-contests">
        <h2 className="s-h2" id="orga-contest">
          Contestations · {contests.length}
        </h2>
        {contests.length === 0 ? (
          <p className="s-muted">Aucune contestation de malus.</p>
        ) : (
          <ul className="s-reviews">
            {contests.map((c) => (
              <ContestItem
                key={c.id}
                contest={c}
                onDecided={(updated) => setContests((cur) => cur.map((i) => (i.id === updated.id ? updated : i)))}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function ReviewItem({ review, onReplied }: { review: EventReview; onReplied: (r: EventReview) => void }) {
  const [text, setText] = useState(review.reply?.text ?? "");
  const [editing, setEditing] = useState(!review.reply);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send() {
    setBusy(true);
    setError(null);
    const res = await apiFetch<EventReview>(`/reviews/${review.id}/reply`, { method: "PUT", json: { reply: text } });
    setBusy(false);
    if (!res.ok) return setError(res.error.message);
    onReplied(res.data);
    setEditing(false);
  }
  return (
    <li className="s-card" data-testid="orga-review">
      <div className="s-row s-row--between">
        <strong>{review.pseudo}</strong>
        <Stars rating={review.rating} />
      </div>
      <p className="s-prewrap">{review.comment}</p>
      <span className="o-t-caption s-muted">{formatDateTime(review.createdAt)}</span>
      {review.reply && !editing ? (
        <>
          <p className="s-reply s-prewrap">
            <span className="s-label o-t-label">Ta réponse publique</span> {review.reply.text}
          </p>
          <Button variant="secondary" icon="chat" onClick={() => setEditing(true)}>
            Modifier la réponse
          </Button>
        </>
      ) : (
        <form
          className="s-form"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label className="o-t-label" htmlFor={`reply-${review.id}`}>
            Réponse publique (affichée sous l'avis)
          </label>
          <textarea
            id={`reply-${review.id}`}
            className="s-textarea o-t-body"
            rows={2}
            maxLength={1000}
            required
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
          />
          {error && (
            <p className="s-error" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" variant="secondary" icon="chat" loading={busy} disabled={!text.trim()}>
            Publier la réponse
          </Button>
        </form>
      )}
    </li>
  );
}

function ContestItem({ contest, onDecided }: { contest: MalusContestView; onDecided: (c: MalusContestView) => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function decide(decision: "accept" | "reject") {
    setBusy(decision);
    setError(null);
    const res = await apiFetch<MalusContestView>(`/malus-contests/${contest.id}/decide`, {
      method: "POST",
      json: { decision, note: note.trim() || null },
    });
    setBusy(null);
    if (!res.ok) return setError(res.error.message);
    onDecided(res.data);
  }
  return (
    <li className="s-card" data-testid="orga-contest">
      <div className="s-row s-row--between">
        <strong>{contest.user.pseudo}</strong>
        <Chip>{contestStatusLabels[contest.status as ContestStatus] ?? contest.status}</Chip>
      </div>
      <p className="s-prewrap">{contest.message}</p>
      <span className="o-t-caption s-muted">
        Reçue le {formatDateTime(contest.createdAt)}
        {contest.status === "pending"
          ? ` · transmise à l'administration le ${formatDateTime(contest.escalatesAt)}`
          : ""}
      </span>
      {contest.organizerNote && <p className="s-reply s-prewrap">{contest.organizerNote}</p>}
      {contest.status === "pending" && (
        <div className="s-form">
          <label className="o-t-label" htmlFor={`note-${contest.id}`}>
            Message au participant (facultatif)
          </label>
          <textarea
            id={`note-${contest.id}`}
            className="s-textarea o-t-body"
            rows={2}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.currentTarget.value)}
          />
          {error && (
            <p className="s-error" role="alert">
              {error}
            </p>
          )}
          <div className="s-row">
            <Button variant="secondary" icon="check" loading={busy === "accept"} onClick={() => void decide("accept")}>
              Annuler le malus
            </Button>
            <Button variant="secondary" icon="close" loading={busy === "reject"} onClick={() => void decide("reject")}>
              Maintenir le malus
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
