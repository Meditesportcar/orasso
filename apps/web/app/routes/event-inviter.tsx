import { Button, Icon, TextField } from "@orasso/design-system/web";
import {
  EVENT_INVITE_NOTE_MAX,
  type EventInviteResult,
  type EventPublic,
  type InviteCandidate,
  type InviteCandidatesPage,
  inviteResultText,
  inviteSendLabel,
  eventInviteLabels as L,
} from "@orasso/shared";
import { useState } from "react";
import { data, Form, useNavigation } from "react-router";

import { PersonAvatar } from "../components/People";
import { apiFetch } from "../lib/api.client";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { isShareable } from "../lib/eventInvite.server";
import type { Route } from "./+types/event-inviter";
import "../styles/event-invite.css";

// Lot R6c (maquette R6.4) : « Inviter du monde » à un événement, sur le site comme dans l'appli. Ton crew (une ligne
// « Tout <crew> » qui coche ses membres), puis ceux que tu suis et qui te suivent ; un mot facultatif ; « Inviter N
// personnes ». L'invitation ne réserve aucune place : chacun candidate, l'organisateur trie comme d'habitude.
export function meta() {
  return [{ title: "Inviter du monde · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireMe(request);
  const event = await apiOrThrow<EventPublic>(request, `/events/by-slug/${encodeURIComponent(params.slug)}`);
  const shareable = isShareable(event);
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 40);
  const page = shareable
    ? await api<InviteCandidatesPage>(
        request,
        `/events/${event.id}/peer-invitations/candidates${q ? `?q=${encodeURIComponent(q)}` : ""}`,
      )
    : null;
  const closed = !shareable ? (event.admission === "invite_only" ? L.inviteOnly : L.closed) : null;
  return {
    event: { id: event.id, slug: event.slug, title: event.title },
    q,
    closed,
    page: page?.ok ? page.data : null,
    // Une erreur n'est jamais une liste vide : le message de l'API, et « Réessayer ».
    loadError: page && !page.ok ? page.error.message || L.loadError : null,
  };
}

type ActionData = { ok: true; text: string; stamp: number } | { ok: false; error: string; stamp: number };

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const eventId = String(form.get("eventId") ?? "");
  const userIds = [...new Set(form.getAll("userId").map((v) => String(v)))].filter(Boolean);
  const note = String(form.get("note") ?? "").trim();
  if (!eventId || userIds.length === 0) {
    return data<ActionData>({ ok: false, error: L.chooseHint, stamp: Date.now() }, { status: 400 });
  }
  const res = await api<EventInviteResult>(request, `/events/${encodeURIComponent(eventId)}/peer-invitations`, {
    method: "POST",
    json: { userIds, note: note || null },
  });
  // 429 : le message de l'API dit combien il en reste.
  if (!res.ok) {
    return data<ActionData>(
      { ok: false, error: res.error.message || L.loadError, stamp: Date.now() },
      { status: res.status },
    );
  }
  return data<ActionData>({
    ok: true,
    text: `${inviteResultText(res.data)} ${L.remaining(res.data.remainingToday)}`,
    stamp: Date.now(),
  });
}

function PersonRow({ p, on, toggle }: { p: InviteCandidate; on: boolean; toggle: (id: string) => void }) {
  const available = p.state === "available";
  const body = (
    <>
      <PersonAvatar url={p.avatarUrl} pseudo={p.pseudo} size={40} />
      <span>
        <b>{p.pseudo}</b>
        <small className="o-never-truncate">{p.caption}</small>
      </span>
    </>
  );
  if (!available) {
    return (
      <li>
        <div className="ri-row is-off" data-testid={`invite-person-${p.pseudo}`} data-state={p.state}>
          {body}
          <span />
        </div>
      </li>
    );
  }
  return (
    <li>
      <label className={`ri-row${on ? " is-on" : ""}`} data-testid={`invite-person-${p.pseudo}`} data-state={p.state}>
        {body}
        <input
          type="checkbox"
          name="userId"
          value={p.userId}
          checked={on}
          onChange={() => toggle(p.userId)}
          aria-label={`Inviter ${p.pseudo}`}
        />
      </label>
    </li>
  );
}

/** Le formulaire d'invitation : la sélection vit ici (remonté par `key` après un envoi ou une recherche). */
function InviteForm({
  event,
  page,
  q,
  result,
}: {
  event: { id: string; title: string };
  page: InviteCandidatesPage;
  q: string;
  result: ActionData | undefined;
}) {
  const busy = useNavigation().state !== "idle";
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [more, setMore] = useState<InviteCandidate[]>([]);
  const [cursor, setCursor] = useState<string | null>(page.nextCursor);
  const [loading, setLoading] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const people = [...page.people, ...more.filter((m) => !page.people.some((p) => p.userId === m.userId))];
  const shown = new Set(people.map((p) => p.userId));
  const remaining = page.remainingToday;
  const n = picked.size;
  const toggle = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleCrew = (ids: string[]) =>
    setPicked((cur) => {
      const next = new Set(cur);
      const all = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (all) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  const loadMore = async () => {
    if (!cursor || loading) return;
    setLoading(true);
    setMoreError(false);
    const qs = new URLSearchParams({ ...(q ? { q } : {}), cursor });
    const res = await apiFetch<InviteCandidatesPage>(`/events/${event.id}/peer-invitations/candidates?${qs}`);
    setLoading(false);
    if (!res.ok) return setMoreError(true);
    setMore((cur) => [...cur, ...res.data.people]);
    setCursor(res.data.nextCursor);
  };
  // Pourquoi le bouton principal est grisé (jamais sans une ligne qui le dit).
  const why = remaining <= 0 ? L.perDay(0) : n === 0 ? L.chooseHint : n > remaining ? L.perDay(remaining) : null;
  return (
    <Form method="post" className="s-stack" data-testid="invite-form">
      <input type="hidden" name="eventId" value={event.id} />
      {/* Les personnes cochées par « Tout <crew> » qui ne sont pas dans les pages chargées. */}
      {[...picked]
        .filter((id) => !shown.has(id))
        .map((id) => (
          <input key={id} type="hidden" name="userId" value={id} />
        ))}

      {page.crews.length > 0 && (
        <section className="s-stack s-stack--tight" aria-labelledby="inv-crews">
          <h2 className="s-label o-t-label" id="inv-crews">
            {L.yourCrews}
          </h2>
          {page.crews.map((c) => {
            const on = c.invitable.length > 0 && c.invitable.every((id) => picked.has(id));
            return (
              <button
                key={c.id}
                type="button"
                className={`ri-row${on ? " is-on" : ""}${c.invitable.length === 0 ? " is-off" : ""}`}
                aria-pressed={on}
                disabled={c.invitable.length === 0}
                onClick={() => toggleCrew(c.invitable)}
                data-testid={`invite-crew-${c.id}`}
              >
                <span className="ri-crewlogo" aria-hidden="true">
                  {c.logoUrl ? (
                    <img className="s-avatar" src={c.logoUrl} alt="" width={40} height={40} />
                  ) : (
                    c.name.slice(0, 2).toUpperCase()
                  )}
                </span>
                <span>
                  <b className="o-never-truncate">{L.allCrew(c.name)}</b>
                  <small>{L.crewCaption(c.membersCount, c.going)}</small>
                </span>
                <span className="ri-tick" aria-hidden="true">
                  <Icon name="check" size={15} />
                </span>
              </button>
            );
          })}
        </section>
      )}

      <section className="s-stack s-stack--tight" aria-labelledby="inv-network">
        <h2 className="s-label o-t-label" id="inv-network">
          {L.network}
        </h2>
        {people.length === 0 ? (
          <p className="s-muted" data-testid="invite-empty">
            {q ? L.noMatch : L.empty}
          </p>
        ) : (
          <ul className="ri-list" data-testid="invite-people">
            {people.map((p) => (
              <PersonRow key={p.userId} p={p} on={picked.has(p.userId)} toggle={toggle} />
            ))}
          </ul>
        )}
        {moreError && (
          <p className="s-error" role="alert">
            {L.loadError}
          </p>
        )}
        {cursor && (
          <Button
            variant="secondary"
            icon={moreError ? "undo" : "down"}
            loading={loading}
            onClick={loadMore}
            data-testid="invite-more"
          >
            {moreError ? L.retry : L.more}
          </Button>
        )}
      </section>

      <TextField
        label={L.note}
        help={L.noteOptional}
        name="note"
        maxLength={EVENT_INVITE_NOTE_MAX}
        placeholder={L.notePlaceholder}
        autoComplete="off"
        data-testid="invite-note"
      />

      {result &&
        (result.ok ? (
          <p className="s-notice s-notice--ok" role="status" data-testid="invite-result">
            {result.text}
          </p>
        ) : (
          <p className="s-error" role="alert" data-testid="invite-result" data-error="true">
            {result.error}
          </p>
        ))}
      <Button type="submit" icon="send" fullWidth loading={busy} disabled={why !== null} data-testid="invite-send">
        {inviteSendLabel(n)}
      </Button>
      {why ? (
        <p className="o-t-caption s-muted" data-testid="invite-why">
          {why}
        </p>
      ) : (
        <p className="o-t-caption s-muted">{L.remaining(remaining)}</p>
      )}
      <p className="ri-note">
        <Icon name="info" size={16} />
        <span>{L.noPlace}</span>
      </p>
    </Form>
  );
}

export default function EventInviter({ loaderData, actionData }: Route.ComponentProps) {
  const { event, q, closed, page, loadError } = loaderData;
  const result = actionData as ActionData | undefined;
  return (
    <div className="s-narrow s-stack" data-testid="inviter">
      <div className="s-stack s-stack--tight">
        <Button variant="secondary" icon="back" href={`/e/${event.slug}`}>
          {event.title}
        </Button>
        <h1 className="s-title o-never-truncate">{L.sheetTitle(event.title)}</h1>
      </div>
      {closed ? (
        <p className="s-notice" role="status" data-testid="invite-closed">
          {closed}
        </p>
      ) : loadError || !page ? (
        <div className="s-stack s-stack--tight" role="alert" data-testid="invite-load-error">
          <p className="s-error">{loadError ?? L.loadError}</p>
          <Button
            variant="secondary"
            icon="undo"
            href={`/e/${event.slug}/inviter${q ? `?q=${encodeURIComponent(q)}` : ""}`}
          >
            {L.retry}
          </Button>
        </div>
      ) : (
        <>
          <Form method="get" className="ri-search" role="search">
            <TextField
              label={L.searchA11y}
              name="q"
              defaultValue={q}
              placeholder={L.search}
              autoComplete="off"
              data-testid="invite-search"
            />
            <Button type="submit" variant="secondary" icon="search">
              Chercher
            </Button>
          </Form>
          <InviteForm key={`${q}|${result?.stamp ?? 0}`} event={event} page={page} q={q} result={result} />
        </>
      )}
    </div>
  );
}
