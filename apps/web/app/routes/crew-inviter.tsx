import { Button, Icon, TextField } from "@orasso/design-system/web";
import {
  type CrewInviteCandidate,
  type CrewInviteCandidatesPage,
  type CrewView,
  crewLabels,
  eventInviteLabels,
  crewInviteLabels as L,
} from "@orasso/shared";
import { useState } from "react";
import { data, Form, redirect, useNavigation } from "react-router";

import { PersonAvatar } from "../components/People";
import { apiFetch } from "../lib/api.client";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import type { Route } from "./+types/crew-inviter";
import "../styles/event-invite.css";

// Lot R6c (maquette R6.7) : inviter quelqu'un dans le crew, pour tout membre actif. Le réseau (abonnés et abonnements)
// avec l'état de chacun ; si la personne accepte, le chef confirme son arrivée. Une invitation du chef fait entrer tout
// de suite. Le chef garde aussi l'invitation par pseudo.
export function meta() {
  return [{ title: "Inviter dans le crew · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  await requireMe(request);
  const crew = await apiOrThrow<CrewView>(request, `/crews/by-slug/${encodeURIComponent(params.slug)}`);
  const member = crew.viewerState === "member" || crew.viewerState === "leader";
  if (!member || crew.archived) throw redirect(`/c/${crew.slug}`);
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 40);
  const page = await api<CrewInviteCandidatesPage>(
    request,
    `/crews/${crew.id}/invite-candidates${q ? `?q=${encodeURIComponent(q)}` : ""}`,
  );
  return {
    crew: { id: crew.id, slug: crew.slug, name: crew.name, leaderPseudo: crew.leader?.pseudo ?? null },
    leader: crew.viewerState === "leader",
    q,
    page: page.ok ? page.data : null,
    loadError: page.ok ? null : page.error.message || "Liste indisponible.",
  };
}

type ActionData =
  | { sentTo: string; status: "invited" | "active"; stamp: number; error?: undefined }
  | { error: string; sentTo?: undefined };

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const crewId = encodeURIComponent(String(form.get("crewId") ?? ""));
  const pseudo = String(form.get("pseudo") ?? "").trim();
  if (!pseudo) return data<ActionData>({ error: crewLabels.invitePseudo }, { status: 400 });
  const res = await api<{ pseudo: string; status: "invited" | "active" }>(request, `/crews/${crewId}/invitations`, {
    method: "POST",
    json: { pseudo },
  });
  if (!res.ok) return data<ActionData>({ error: res.error.message }, { status: res.status });
  return data<ActionData>({ sentTo: res.data.pseudo, status: res.data.status, stamp: Date.now() });
}

/**
 * Tour 2 (relecture Codex 7) : la personne qu'on vient d'inviter change d'état aussi dans les pages « Voir plus » déjà
 * affichées (la première page, elle, est relue par le loader) ; entrée tout de suite (invitation du chef qui vaut
 * acceptation de sa demande), elle quitte la liste comme les autres membres.
 */
function afterInvite(people: CrewInviteCandidate[], sent: { sentTo: string; status: "invited" | "active" }) {
  const same = (p: CrewInviteCandidate) => p.pseudo.toLowerCase() === sent.sentTo.toLowerCase();
  if (sent.status === "active") return people.filter((p) => !same(p));
  return people.map((p) =>
    same(p) ? { ...p, state: "invited" as const, caption: eventInviteLabels.invitedByYou } : p,
  );
}

/** Remonté à chaque recherche : les pages « Voir plus » chargées repartent de zéro. */
export default function CrewInviter(props: Route.ComponentProps) {
  return <CrewInviterBody key={props.loaderData.q} {...props} />;
}

function CrewInviterBody({ loaderData, actionData }: Route.ComponentProps) {
  const { crew, leader, q, page, loadError } = loaderData;
  const result = actionData as ActionData | undefined;
  const busy = useNavigation().state !== "idle";
  const [more, setMore] = useState<CrewInviteCandidate[]>([]);
  const [cursor, setCursor] = useState<string | null>(page?.nextCursor ?? null);
  const [loading, setLoading] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [applied, setApplied] = useState(0);
  if (result?.sentTo && result.stamp !== applied) {
    setApplied(result.stamp);
    setMore((cur) => afterInvite(cur, result));
  }
  const leaderName = crew.leaderPseudo ?? L.leaderFallback;
  const people = page ? [...page.people, ...more.filter((m) => !page.people.some((p) => p.userId === m.userId))] : [];
  const loadMore = async () => {
    if (!cursor || loading) return;
    setLoading(true);
    setMoreError(false);
    const qs = new URLSearchParams({ ...(q ? { q } : {}), cursor });
    const res = await apiFetch<CrewInviteCandidatesPage>(`/crews/${crew.id}/invite-candidates?${qs}`);
    setLoading(false);
    if (!res.ok) return setMoreError(true);
    setMore((cur) => [...cur, ...res.data.people]);
    setCursor(res.data.nextCursor);
  };
  return (
    <div className="s-narrow s-stack" data-testid="crew-inviter">
      <div className="s-stack s-stack--tight">
        <Button variant="secondary" icon="back" href={`/c/${crew.slug}?onglet=membres`}>
          {crew.name}
        </Button>
        <h1 className="s-title o-never-truncate">{L.sheetTitle(crew.name)}</h1>
      </div>

      {result?.sentTo && (
        <div className="s-notice s-notice--ok s-stack s-stack--tight" role="status" data-testid="crew-invite-sent">
          <strong>{L.sentTitle(result.sentTo)}</strong>
          <span>{leader ? L.sentByLeader : L.sentByMember(leaderName)}</span>
        </div>
      )}
      {result?.error && (
        <p className="s-error" role="alert" data-testid="crew-invite-error">
          {result.error}
        </p>
      )}

      {loadError || !page ? (
        <div className="s-stack s-stack--tight" role="alert" data-testid="crew-invite-load-error">
          <p className="s-error">{loadError ?? "Liste indisponible."}</p>
          <Button variant="secondary" icon="undo" href={`/c/${crew.slug}/inviter`}>
            Réessayer
          </Button>
        </div>
      ) : (
        <>
          <Form method="get" className="ri-search" role="search">
            <TextField
              label={L.search}
              name="q"
              defaultValue={q}
              placeholder={L.search}
              autoComplete="off"
              data-testid="crew-invite-search"
            />
            <Button type="submit" variant="secondary" icon="search">
              Chercher
            </Button>
          </Form>
          {people.length === 0 ? (
            <p className="s-muted" data-testid="crew-invite-empty">
              {q ? L.noMatch : L.empty}
            </p>
          ) : (
            <ul className="ri-list" data-testid="crew-invite-people">
              {people.map((p) => {
                const available = p.state === "available";
                return (
                  <li key={p.userId}>
                    <div className={`ri-row${available ? "" : " is-off"}`} data-state={p.state}>
                      <PersonAvatar url={p.avatarUrl} pseudo={p.pseudo} size={40} />
                      <span>
                        <b>{p.pseudo}</b>
                        <small className="o-never-truncate">{p.caption}</small>
                      </span>
                      {available ? (
                        <Form method="post" preventScrollReset>
                          <input type="hidden" name="crewId" value={crew.id} />
                          <input type="hidden" name="pseudo" value={p.pseudo} />
                          <Button
                            type="submit"
                            variant="secondary"
                            icon="add"
                            loading={busy}
                            aria-label={L.inviteA11y(p.pseudo)}
                            data-testid={`crew-invite-${p.pseudo}`}
                          >
                            {L.invite}
                          </Button>
                        </Form>
                      ) : (
                        <span />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {moreError && (
            <p className="s-error" role="alert">
              Liste indisponible.
            </p>
          )}
          {cursor && (
            <Button
              variant="secondary"
              icon={moreError ? "undo" : "down"}
              loading={loading}
              onClick={loadMore}
              data-testid="crew-invite-more"
            >
              {moreError ? "Réessayer" : "Voir plus"}
            </Button>
          )}
        </>
      )}

      <section className="s-stack s-stack--tight" aria-labelledby="by-pseudo">
        <h2 className="s-label o-t-label" id="by-pseudo">
          {L.byPseudo}
        </h2>
        <Form method="post" className="ri-search" data-testid="crew-invite-pseudo-form">
          <input type="hidden" name="crewId" value={crew.id} />
          <TextField label={crewLabels.invitePseudo} name="pseudo" required autoComplete="off" />
          <Button type="submit" variant="secondary" icon="add" loading={busy}>
            {L.invite}
          </Button>
        </Form>
      </section>

      <p className="ri-note" data-testid="crew-invite-note">
        <Icon name="info" size={16} />
        <span>{leader ? L.leaderDirect : L.leaderConfirms(leaderName)}</span>
      </p>
    </div>
  );
}
