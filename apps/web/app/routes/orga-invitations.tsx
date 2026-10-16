// Invitations nominatives d'un événement, côté organisateur (lot 25, ARCHITECTURE-SUITE § 9.1) : inviter par pseudo,
// par véhicule (abonnés et retenus des éditions précédentes), par e-mail, avec un message ; « Inviter les retenus de
// l'édition … » ; liste des invitations envoyées et leur statut, retrait d'une invitation en attente.
import { Button, Chip, TextField } from "@orasso/design-system/web";
import {
  applicationStatusLabels,
  type EventOrganizer,
  INVITATION_MESSAGE_MAX,
  type InvitationCandidate,
  type InvitationCreateResult,
  type InvitationSourceEvent,
  invitationLabels,
  invitationSkipLabels,
  invitationStatusLabels,
  type OrganizerInvitation,
} from "@orasso/shared";
import { data, Form, useNavigation } from "react-router";

import { TextAreaField } from "../components/Fields";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { formatDateTime, formatDay } from "../lib/format";
import "../styles/invitations.css";
import type { Route } from "./+types/orga-invitations";

const L = invitationLabels;

export function meta() {
  return [{ title: "Invitations · Orasso" }, { name: "robots", content: "noindex" }];
}

async function organizerOf(request: Request, slug: string) {
  const me = await requireMe(request);
  const membership = me.memberships.find((m) => m.structureSlug === slug && m.status === "active");
  if (!membership || membership.role === "staff") {
    throw new Response("Réservé aux organisateurs de la structure.", { status: 403 });
  }
  return membership;
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const membership = await organizerOf(request, params.structure);
  const event = await apiOrThrow<EventOrganizer>(request, `/events/${params.eventId}`);
  if (event.structure.id !== membership.structureId) throw new Response("Événement introuvable.", { status: 404 });
  const [invitations, sources, candidates] = await Promise.all([
    apiOrThrow<OrganizerInvitation[]>(request, `/events/${params.eventId}/invitations`),
    api<InvitationSourceEvent[]>(request, `/events/${params.eventId}/invitations/sources`),
    api<InvitationCandidate[]>(request, `/events/${params.eventId}/invitations/candidates`),
  ]);
  return {
    event,
    invitations,
    sources: sources.ok ? sources.data : [],
    candidates: candidates.ok ? candidates.data : [],
  };
}

type Result = { error?: string; ok?: string; skipped?: InvitationCreateResult["skipped"] };

const splitList = (value: FormDataEntryValue | null) =>
  String(value ?? "")
    .split(/[\s,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);

export async function action({ request, params }: Route.ActionArgs) {
  await organizerOf(request, params.structure);
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const id = params.eventId;
  const message = String(form.get("message") ?? "").trim() || null;
  if (intent === "remove") {
    const res = await api(request, `/events/${id}/invitations/${String(form.get("invitationId") ?? "")}`, {
      method: "DELETE",
    });
    return res.ok
      ? data({} satisfies Result)
      : data({ error: res.error.message } satisfies Result, { status: res.status });
  }
  const res =
    intent === "from_event"
      ? await api<InvitationCreateResult>(request, `/events/${id}/invitations/from-event`, {
          method: "POST",
          json: { sourceEventId: String(form.get("sourceEventId") ?? ""), message },
        })
      : await api<InvitationCreateResult>(request, `/events/${id}/invitations`, {
          method: "POST",
          json: {
            pseudos: splitList(form.get("pseudos")),
            vehicleIds: form.getAll("vehicleIds").map(String),
            emails: splitList(form.get("emails")),
            message,
          },
        });
  if (!res.ok) return data({ error: res.error.message } satisfies Result, { status: res.status });
  return data({ ok: L.created(res.data.created), skipped: res.data.skipped } satisfies Result);
}

function targetOf(i: OrganizerInvitation): string {
  if (i.vehicle) return `${i.vehicle.label}${i.pseudo ? ` · ${i.pseudo}` : ""}`;
  return i.pseudo ?? i.email ?? "—";
}

export default function OrgaInvitations({ loaderData, actionData, params }: Route.ComponentProps) {
  const { event, invitations, sources, candidates } = loaderData;
  const busy = useNavigation().state !== "idle";
  const result = actionData as Result | undefined;
  const invited = new Set(invitations.flatMap((i) => (i.vehicle ? [i.vehicle.id] : [])));
  const closed = event.isLocked || event.status !== "published";
  return (
    <div className="s-stack" data-testid="orga-invitations">
      <div className="s-stack s-stack--tight">
        <a className="o-t-caption" href={`/orga/${params.structure}/e/${event.id}`}>
          ← {event.title}
        </a>
        <h1 className="s-title">{L.inviteTitle}</h1>
        <p className="s-muted">
          {event.admission === "invite_only" ? `${L.privateEvent}. ` : ""}
          {L.validUntil(formatDateTime(event.lockAt))}.
        </p>
      </div>

      {result?.error && (
        <p className="s-error" role="alert">
          {result.error}
        </p>
      )}
      {result?.ok && (
        <p className="s-notice s-notice--ok" role="status" data-testid="invitations-ok">
          {result.ok}
          {result.skipped?.length
            ? ` · ${L.skipped(result.skipped.length)} : ${result.skipped
                .map((x) => `${x.target} (${invitationSkipLabels[x.reason]})`)
                .join(", ")}`
            : ""}
        </p>
      )}

      {closed ? (
        <p className="s-notice">
          {event.status === "published"
            ? "Inscriptions verrouillées : les invitations ne sont plus possibles."
            : "Publie l'événement pour inviter."}
        </p>
      ) : (
        <div className="inv-grid">
          <Form method="post" className="s-card s-form" aria-labelledby="invite-title">
            <h2 id="invite-title" className="s-h2">
              {L.invite}
            </h2>
            <TextField label={L.invitePseudo} name="pseudos" help={L.invitePseudoHint} autoComplete="off" />
            <TextField
              label={L.inviteEmail}
              name="emails"
              help={L.inviteEmailHint}
              autoComplete="off"
              inputMode="email"
            />
            <fieldset className="s-stack s-stack--tight">
              <legend className="o-t-label s-label">{L.inviteVehicles}</legend>
              <p className="o-t-caption s-muted">{L.inviteVehiclesHint}</p>
              {candidates.length === 0 ? (
                <p className="o-t-caption s-muted">{L.noCandidates}</p>
              ) : (
                <div className="inv-picker" data-testid="invitation-candidates">
                  {candidates.map((c) => (
                    <label key={c.vehicleId} className="inv-pick">
                      <input
                        type="checkbox"
                        name="vehicleIds"
                        value={c.vehicleId}
                        disabled={invited.has(c.vehicleId)}
                        aria-label={`${c.label} · ${c.pseudo}`}
                      />
                      {c.photoUrl ? <img src={c.photoUrl} alt="" /> : <span className="inv-pick__thumb" />}
                      <span className="inv-pick__text">
                        <span className="o-never-truncate">{c.label}</span>
                        <span className="o-t-caption s-muted">
                          {c.pseudo} · {c.source === "past" ? "retenu d'une édition passée" : "abonné"}
                          {invited.has(c.vehicleId) ? " · déjà invité" : ""}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>
            <TextAreaField
              label={L.message}
              name="message"
              placeholder={L.messagePlaceholder}
              maxLength={INVITATION_MESSAGE_MAX}
              rows={3}
            />
            <Button type="submit" name="intent" value="invite" icon="entry" loading={busy} data-testid="invite-send">
              {L.send}
            </Button>
          </Form>

          <section className="s-card s-stack" aria-labelledby="from-event-title">
            <h2 id="from-event-title" className="s-h2">
              Édition précédente
            </h2>
            <p className="o-t-caption s-muted">{L.fromEventHint}</p>
            {sources.length === 0 ? (
              <p className="o-t-caption s-muted">{L.noSourceEvent}</p>
            ) : (
              sources.map((src) => (
                <Form method="post" key={src.id} className="s-stack s-stack--tight">
                  <input type="hidden" name="sourceEventId" value={src.id} />
                  <span className="o-t-caption s-muted">
                    {formatDay(src.startsAt)} · {src.acceptedCount} retenus
                  </span>
                  <Button
                    type="submit"
                    name="intent"
                    value="from_event"
                    variant="secondary"
                    icon="undo"
                    disabled={busy}
                    data-testid="invite-from-event"
                  >
                    {L.fromEvent(src.title)}
                  </Button>
                </Form>
              ))
            )}
            <p className="o-t-caption s-muted">
              Chaque invité reçoit une notification ; une adresse sans compte reçoit un e-mail.
            </p>
          </section>
        </div>
      )}

      <section className="s-card s-stack" aria-labelledby="sent-title">
        <h2 id="sent-title" className="s-h2">
          {L.sentList} · {invitations.length}
        </h2>
        {invitations.length === 0 ? (
          <p className="s-muted">{L.sentEmpty}</p>
        ) : (
          <table className="inv-table" data-testid="invitations-table">
            <thead>
              <tr>
                <th>Invité</th>
                <th>Statut</th>
                <th>Envoyée</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {invitations.map((i) => (
                <tr key={i.id} data-testid="invitation-row" data-status={i.status}>
                  <td>
                    <span className="o-never-truncate">{targetOf(i)}</span>
                    <div className="o-t-caption s-muted">
                      {i.kind === "email" ? L.targetEmail : i.kind === "vehicle" ? L.targetVehicle : L.targetUser}
                    </div>
                  </td>
                  <td>
                    <Chip selected={i.status === "accepted"}>{invitationStatusLabels[i.status]}</Chip>
                    {i.application && (
                      <div className="o-t-caption s-muted">{applicationStatusLabels[i.application.status]}</div>
                    )}
                  </td>
                  <td className="o-t-caption">{formatDateTime(i.createdAt)}</td>
                  <td>
                    {i.status === "pending" && (
                      <Form method="post">
                        <input type="hidden" name="invitationId" value={i.id} />
                        <Button
                          type="submit"
                          name="intent"
                          value="remove"
                          variant="secondary"
                          icon="close"
                          disabled={busy}
                        >
                          {L.remove}
                        </Button>
                      </Form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
