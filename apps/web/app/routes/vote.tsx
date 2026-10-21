// Prix du public (lot 57, parité de l'appli du lot 50, prototype DA v2 `s-vote`) : une voix par personne pointée, pas
// pour soi, modifiable jusqu'à la fin de l'événement ; le classement bouge en direct (canal `event:{id}:votes`). Les
// règles sont toutes dans l'API (lot 49) : ici, la grille des véhicules pointés, le vote et le classement.
import { Button, Chip, Plate } from "@orasso/design-system/web";
import {
  type AudienceCandidate,
  type AudienceCandidates,
  type AudiencePrizeBoard,
  type AudiencePrizeMine,
  audiencePrizeTexts,
  type EventPublic,
  voteScreenTexts,
} from "@orasso/shared";
import { useEffect, useState } from "react";
import { data, Form, useNavigation } from "react-router";

import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { useLiveRevalidate } from "../lib/useLiveRevalidate";
import "../styles/passport.css";
import type { Route } from "./+types/vote";

export function meta({ loaderData: d }: Route.MetaArgs) {
  return [
    { title: `${audiencePrizeTexts.title}${d ? ` · ${d.event.title}` : ""} · Orasso` },
    { name: "robots", content: "noindex" },
  ];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireMe(request);
  const event = await apiOrThrow<EventPublic>(request, `/events/by-slug/${encodeURIComponent(params.slug)}`);
  const [board, mine] = await Promise.all([
    apiOrThrow<AudiencePrizeBoard>(request, `/events/${event.id}/audience-prize`),
    apiOrThrow<AudiencePrizeMine>(request, `/events/${event.id}/audience-prize/mine`),
  ]);
  // La grille : tous les véhicules pointés (pages de l'API), dans un ordre stable sans rapport avec le classement.
  const candidates: AudienceCandidate[] = [];
  let cursor: number | null = 0;
  for (let guard = 0; cursor !== null && guard < 20; guard++) {
    const res: Awaited<ReturnType<typeof api<AudienceCandidates>>> = await api<AudienceCandidates>(
      request,
      `/events/${event.id}/audience-prize/candidates?cursor=${cursor}`,
    );
    if (!res.ok) break;
    candidates.push(...res.data.items);
    cursor = res.data.next;
  }
  candidates.sort((a, b) => a.applicationId.localeCompare(b.applicationId));
  return { event: { id: event.id, slug: event.slug, title: event.title }, board, mine, candidates };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const eventId = String(form.get("eventId") ?? "");
  const res = await api(request, `/events/${encodeURIComponent(eventId)}/audience-prize/vote`, {
    method: "PUT",
    json: { applicationId: String(form.get("applicationId") ?? "") },
  });
  if (!res.ok) return data({ error: res.error.message, ok: false }, { status: res.status });
  return data({ error: null, ok: true });
}

export default function Vote({ loaderData, actionData }: Route.ComponentProps) {
  const { event, board, mine, candidates } = loaderData;
  const busy = useNavigation().state !== "idle";
  const [liveTotal, setLiveTotal] = useState(board.total);
  useEffect(() => setLiveTotal(board.total), [board.total]);
  // Classement et grille en direct : un message utile recharge la page, au plus une fois toutes les 10 s, et le canal
  // qui revient après une coupure la recharge aussi (relecture du lot 57).
  const { connected } = useLiveRevalidate(
    `event:${event.id}:votes`,
    (m) => m.type === "votes.changed" || m.type === "votes.candidates.changed",
    {
      onMessage: (m) => {
        const total = (m.payload as { total?: number } | null)?.total;
        if (m.type === "votes.changed" && typeof total === "number") setLiveTotal(total);
      },
    },
  );

  const own = new Set(mine.ownApplicationIds);
  const myEntry = board.entries.find((e) => own.has(e.applicationId));
  const reason = board.settled
    ? null
    : mine.canVote
      ? null
      : mine.reason === "vote_closed" || (!board.open && board.total > 0)
        ? voteScreenTexts.closedNote
        : mine.reason === "not_checked_in"
          ? audiencePrizeTexts.errors.not_checked_in
          : audiencePrizeTexts.notOpen;
  const top = board.entries[0]?.votes ?? 0;

  return (
    <div className="s-stack" data-testid="vote" data-live={connected ? "on" : "off"}>
      <a href="/app/passeport" className="o-t-meta">
        ← Passeport
      </a>
      <div className="s-head">
        <div className="o-t-label s-label">{event.title}</div>
        <h1 className="s-title">{audiencePrizeTexts.title}</h1>
      </div>
      <p className="s-lead">
        {board.settled
          ? voteScreenTexts.results
          : board.open
            ? audiencePrizeTexts.openUntil(new Date(board.closesAt))
            : audiencePrizeTexts.closed}
        {mine.checkedInAt ? ` · ${audiencePrizeTexts.checkedInAt(new Date(mine.checkedInAt))}` : ""}
      </p>

      {actionData?.error && (
        <p className="s-error" role="alert">
          {actionData.error}
        </p>
      )}
      {mine.votedFor && !board.settled && (
        <p className="s-notice s-notice--ok" role="status" data-testid="vote-saved">
          {voteScreenTexts.saved(new Date(board.closesAt))}
        </p>
      )}
      {reason && (
        <p className="s-notice" data-testid="vote-reason">
          {reason}
        </p>
      )}

      {board.settled && (
        <Plate className="s-stack s-stack--tight" data-testid="vote-winner">
          <div className="o-t-label">{voteScreenTexts.winner}</div>
          {board.winner ? (
            <strong className="o-never-truncate">
              {board.winner.vehicleLabel} · {board.winner.pseudo}
            </strong>
          ) : (
            <p>{voteScreenTexts.noWinner}</p>
          )}
        </Plate>
      )}

      {!board.settled && (
        <section className="s-stack s-stack--tight" aria-labelledby="vote-grid">
          <h2 id="vote-grid" className="s-h2">
            {audiencePrizeTexts.oneVote}
          </h2>
          <p className="o-t-caption s-muted">{audiencePrizeTexts.rules(board.winnerPoints)}</p>
          {candidates.length === 0 ? (
            <p className="s-muted">{voteScreenTexts.empty}</p>
          ) : (
            <Form method="post">
              <input type="hidden" name="eventId" value={event.id} />
              <ul className="vote-grid" data-testid="vote-grid">
                {candidates.map((c, i) => {
                  const mineOwn = own.has(c.applicationId);
                  const chosen = mine.votedFor === c.applicationId;
                  return (
                    <li key={c.applicationId}>
                      <button
                        type="submit"
                        name="applicationId"
                        value={c.applicationId}
                        className="vote-card"
                        aria-pressed={chosen}
                        aria-label={mineOwn ? voteScreenTexts.you : voteScreenTexts.pick(c.vehicleLabel)}
                        disabled={!mine.canVote || mineOwn || busy}
                        data-testid="vote-candidate"
                      >
                        {c.photoUrl ? <img className="vote-card__photo" src={c.photoUrl} alt="" /> : null}
                        <span className="o-t-caption s-muted">{voteScreenTexts.number(i + 1)}</span>
                        <strong className="o-never-truncate">{c.vehicleLabel}</strong>
                        <span className="o-t-caption">{c.pseudo}</span>
                        {mineOwn && <Chip>{voteScreenTexts.you}</Chip>}
                        {chosen && <Chip variant="accent">{voteScreenTexts.yourVote}</Chip>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Form>
          )}
        </section>
      )}

      <section className="s-stack s-stack--tight" aria-labelledby="vote-ranking" data-testid="vote-ranking">
        <div className="s-row s-row--between">
          <h2 id="vote-ranking" className="s-h2">
            {audiencePrizeTexts.ranking}
          </h2>
          {!board.settled && board.open && <Chip>{audiencePrizeTexts.live}</Chip>}
        </div>
        <p className="o-t-caption s-muted" data-testid="vote-total">
          {audiencePrizeTexts.votes(liveTotal)}
          {myEntry ? ` · ${audiencePrizeTexts.rank(myEntry.rank, board.vehicles)}` : ""}
        </p>
        <ol className="vote-rank">
          {board.entries.slice(0, 10).map((e) => (
            <li key={e.applicationId}>
              <span className="o-t-number-narrow">{e.rank}</span>
              <span className="o-never-truncate">
                {e.vehicleLabel} <span className="s-muted">· {e.pseudo}</span>
                <span
                  className="vote-bar"
                  style={{ width: `${top && e.votes ? Math.max(4, (e.votes / top) * 100) : 0}%` }}
                />
              </span>
              <span className="o-t-caption">{audiencePrizeTexts.votes(e.votes)}</span>
            </li>
          ))}
        </ol>
      </section>
      <Button variant="secondary" icon="calendar" href={`/e/${event.slug}`}>
        Voir l'événement
      </Button>
    </div>
  );
}
