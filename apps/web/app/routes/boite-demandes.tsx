import { Button, Chip } from "@orasso/design-system/web";
import {
  type ContactAcceptResult,
  type ContactRequestView,
  type CrewConfirmationRequest,
  type CrewInboxRequest,
  crewLabels,
  type FollowPerson,
  type FollowRequestsPage,
  followRequestNotificationTitle,
  gradeLabels,
  type InboxSummary,
  invitationLabels,
  messagingLabels,
  networkLabels,
  type ReceivedInvitation,
  type StaffInvitationView,
  staffRequestLabels,
  staffRoleLabels,
} from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";

import { CrewLogo } from "../components/Crews";
import { InboxSegments } from "../components/Messaging";
import { PersonAvatar } from "../components/People";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { crewAction, isCrewIntent } from "../lib/crews.server";
import { type FollowActionData, followAction, isFollowIntent } from "../lib/follow.server";
import { formatDateTime } from "../lib/format";
import type { Route } from "./+types/boite-demandes";

// Boîte > Demandes (lot 18) : rangées à part — demandes d'abonnement (lot R6b : elles remplacent les anciennes demandes)
// et demandes de contact (le message est affiché, on accepte ou on refuse ; le refus est silencieux). Les lots 19 et
// suivants ajoutent leurs sortes ici. Lot R6b, tour 2 (relecture Codex 4) : les demandes d'abonnement vont par 30,
// « Suivants » (`?apres=`) ouvre la page suivante : aucune n'est cachée.
export function meta() {
  return [{ title: "Demandes · Boîte · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireMe(request);
  const cursor = new URL(request.url).searchParams.get("apres") ?? "";
  const [follows, contacts, summary, crews, confirmations, staffInvitations] = await Promise.all([
    apiOrThrow<FollowRequestsPage>(
      request,
      `/me/follow-requests${cursor ? `?${new URLSearchParams({ cursor }).toString()}` : ""}`,
    ),
    apiOrThrow<{ items: ContactRequestView[] }>(request, "/me/contact-requests"),
    apiOrThrow<InboxSummary>(request, "/me/inbox/summary"),
    // Crews (lot 19) : demandes reçues par un chef, invitations reçues, venues en crew à confirmer.
    apiOrThrow<CrewInboxRequest[]>(request, "/me/crew-requests"),
    apiOrThrow<CrewConfirmationRequest[]>(request, "/me/crew-confirmations"),
    // Invitations à rejoindre une structure (lot 24).
    apiOrThrow<StaffInvitationView[]>(request, "/me/staff-invitations"),
  ]);
  // Invitations à un événement (lot 25) : la réponse (avec le choix du véhicule) se fait dans Accès.
  const invitations = await api<ReceivedInvitation[]>(request, "/me/event-invitations");
  return {
    follows: follows.items,
    followsNext: follows.nextCursor,
    followsAfter: cursor !== "",
    contactsIn: contacts.items.filter((c) => c.direction === "in"),
    contactsOut: contacts.items.filter((c) => c.direction === "out"),
    summary,
    crews,
    confirmations,
    staffInvitations,
    invitations: invitations.ok ? invitations.data : [],
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (isFollowIntent(intent)) return followAction(request, form);
  if (isCrewIntent(intent)) {
    const res = await crewAction(request, form);
    return data({ formError: res.data.crewError }, { status: res.init?.status ?? 200 });
  }
  // Invitation à rejoindre une structure (lot 24) : accepter ou refuser, seul le destinataire le peut.
  if (intent === "staff_accept" || intent === "staff_decline") {
    const structureId = encodeURIComponent(String(form.get("structureId") ?? ""));
    const answer = intent === "staff_accept" ? "accept" : "decline";
    const res = await api(request, `/me/memberships/${structureId}/${answer}`, { method: "POST" });
    if (!res.ok) return data({ formError: res.error.message }, { status: res.status });
    return data({ formError: null as string | null });
  }
  const id = encodeURIComponent(String(form.get("id") ?? ""));
  if (intent === "contact_accept") {
    const res = await api<ContactAcceptResult>(request, `/contact-requests/${id}/accept`, { method: "POST" });
    if (res.ok) throw redirect(`/app/boite/${res.data.conversationId}`);
    return data({ formError: res.error.message }, { status: res.status });
  }
  if (intent === "contact_decline") {
    const res = await api(request, `/contact-requests/${id}/decline`, { method: "POST" });
    if (!res.ok) return data({ formError: res.error.message }, { status: res.status });
    return data({ formError: null as string | null });
  }
  return data({ formError: "Action inconnue." }, { status: 400 });
}

function Person({ p }: { p: Pick<FollowPerson, "pseudo" | "avatarUrl" | "grade"> }) {
  return (
    <>
      <PersonAvatar url={p.avatarUrl} pseudo={p.pseudo} size={44} />
      <div className="s-person__main">
        <a className="s-person__name o-t-title" href={`/u/${encodeURIComponent(p.pseudo)}`}>
          {p.pseudo}
        </a>
        <Chip>{gradeLabels[p.grade]}</Chip>
      </div>
    </>
  );
}

function DecideFollow({ p, busy }: { p: FollowPerson; busy: boolean }) {
  return (
    <Form method="post" className="r6row__acts">
      <input type="hidden" name="userId" value={p.userId} />
      <input type="hidden" name="pseudo" value={p.pseudo} />
      <Button
        type="submit"
        name="intent"
        value="follow_accept"
        variant="secondary"
        icon="check"
        loading={busy}
        data-testid="net-request-accept"
      >
        {networkLabels.accept}
      </Button>
      <Button
        type="submit"
        name="intent"
        value="follow_decline"
        variant="close"
        label={networkLabels.decline(p.pseudo)}
        className="fl-x"
        disabled={busy}
        data-testid="net-request-decline"
      />
    </Form>
  );
}

function Decide({ id, busy }: { id: string; busy: boolean }) {
  return (
    <div className="s-row">
      <Form method="post">
        <input type="hidden" name="intent" value="contact_accept" />
        <input type="hidden" name="id" value={id} />
        <Button type="submit" variant="secondary" icon="check" loading={busy}>
          {messagingLabels.accept}
        </Button>
      </Form>
      <Form method="post">
        <input type="hidden" name="intent" value="contact_decline" />
        <input type="hidden" name="id" value={id} />
        <Button type="submit" variant="secondary" icon="close" loading={busy}>
          {messagingLabels.decline}
        </Button>
      </Form>
    </div>
  );
}

export default function Demandes({ loaderData, actionData }: Route.ComponentProps) {
  const {
    follows,
    followsNext,
    followsAfter,
    contactsIn,
    contactsOut,
    summary,
    crews,
    confirmations,
    staffInvitations,
    invitations,
  } = loaderData;
  const busy = useNavigation().state !== "idle";
  // Deux sortes de retours d'action : le suivi (`followError`, `followNotice`) et les autres demandes (`formError`).
  const done = actionData as (Partial<FollowActionData> & { formError?: string | null }) | undefined;
  const message = { error: done?.formError ?? done?.followError ?? null, notice: done?.followNotice ?? null };
  const requests = Object.values(summary.requests).reduce((a, b) => a + b, 0);
  const empty =
    follows.length === 0 &&
    contactsIn.length === 0 &&
    crews.length === 0 &&
    confirmations.length === 0 &&
    staffInvitations.length === 0 &&
    invitations.length === 0;
  return (
    <div className="s-narrow s-stack" data-testid="demandes">
      <h1 className="s-title">{messagingLabels.inbox}</h1>
      <InboxSegments active="requests" messages={summary.unreadMessages} requests={requests} />
      {message.error && (
        <p className="s-error" role="alert">
          {message.error}
        </p>
      )}
      {message.notice && (
        <p className="s-notice s-notice--ok" role="status" data-testid="request-notice">
          {message.notice}
        </p>
      )}
      {empty && <p className="s-notice">{messagingLabels.noRequests}</p>}
      {(follows.length > 0 || contactsIn.length > 0) && (
        <ul className="s-people">
          {follows.map((r) => (
            <li key={r.userId} className="s-person" data-testid="request-follow">
              <Person p={r} />
              <div className="s-person__main">
                <span className="s-label o-t-label">{followRequestNotificationTitle}</span>
                {r.vehicle && <p className="o-t-caption s-muted">{r.vehicle}</p>}
              </div>
              <DecideFollow p={r} busy={busy} />
            </li>
          ))}
          {contactsIn.map((r) => (
            <li key={r.id} className="s-person" data-testid="request-contact">
              <Person p={r.person} />
              <div className="s-person__main">
                <span className="s-label o-t-label">{messagingLabels.contactRequestFrom}</span>
                <p className="s-prewrap">{r.message}</p>
              </div>
              <Decide id={r.id} busy={busy} />
            </li>
          ))}
        </ul>
      )}
      {(followsNext || followsAfter) && (
        <div className="s-row" data-testid="request-follow-pages">
          {followsAfter && (
            <Button variant="secondary" icon="back" href="/app/boite/demandes">
              {networkLabels.firstPage}
            </Button>
          )}
          {followsNext && (
            <Button
              variant="secondary"
              icon="down"
              href={`/app/boite/demandes?${new URLSearchParams({ apres: followsNext }).toString()}`}
              data-testid="request-follow-more"
            >
              {networkLabels.next}
            </Button>
          )}
        </div>
      )}
      {invitations.length > 0 && (
        <section className="s-section" aria-labelledby="invitations-titre">
          <h2 id="invitations-titre" className="s-h2">
            {invitationLabels.notifTitle}
          </h2>
          <ul className="s-people">
            {invitations.map((i) => (
              <li key={i.id} className="s-person" data-testid="request-event-invitation">
                <div className="s-person__main">
                  <span className="s-label o-t-label">{invitationLabels.invitedBy(i.event.structure.name)}</span>
                  <a href={`/e/${i.event.slug}`} className="o-t-title">
                    {i.event.title}
                  </a>
                  {i.vehicle && <span className="o-never-truncate">{i.vehicle.label}</span>}
                  <span className="o-t-caption s-muted">
                    {invitationLabels.validUntil(formatDateTime(i.event.lockAt))}
                  </span>
                </div>
                <Button variant="secondary" icon="entry" href="/app/sorties">
                  {invitationLabels.openAccess}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {confirmations.length > 0 && (
        <section className="s-section" aria-labelledby="venues-titre">
          <h2 id="venues-titre" className="s-h2">
            {crewLabels.crewConfirmations}
          </h2>
          <ul className="s-people">
            {confirmations.map((c) => (
              <li key={c.applicationId} className="s-person" data-testid="request-crew-confirmation">
                <CrewLogo url={c.crew.logoUrl} name={c.crew.name} size={44} />
                <div className="s-person__main">
                  <span className="s-label o-t-label">{crewLabels.confirmTitle(c.crew.name)}</span>
                  <a href={`/e/${c.event.slug}`} className="o-t-title">
                    {c.event.title}
                  </a>
                  {c.vehicleLabel && <span className="o-never-truncate">{c.vehicleLabel}</span>}
                  <span className="o-t-caption s-muted">
                    {crewLabels.confirmBefore(formatDateTime(c.confirmBefore))}
                  </span>
                </div>
                <Button variant="secondary" icon="qr" href="/app/sorties">
                  {crewLabels.confirmVenue}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {staffInvitations.length > 0 && (
        <section className="s-section" aria-labelledby="staff-titre">
          <h2 id="staff-titre" className="s-h2">
            {staffRequestLabels.invited}
          </h2>
          <ul className="s-people">
            {staffInvitations.map((i) => (
              <li key={i.structureId} className="s-person" data-testid="request-staff-invitation">
                <CrewLogo url={i.logoUrl} name={i.structureName} size={44} />
                <div className="s-person__main">
                  <span className="s-label o-t-label">
                    {i.role === "co_organizer" ? "Invitation comme co-organisateur" : "Invitation dans le staff"}
                  </span>
                  <a className="o-t-title o-never-truncate" href={`/o/${i.structureSlug}`}>
                    {i.structureName}
                  </a>
                  {i.staffRoles.length > 0 && (
                    <span className="o-t-caption s-muted">
                      {i.staffRoles.map((r) => staffRoleLabels[r]).join(" · ")}
                    </span>
                  )}
                  {i.invitedBy && <span className="o-t-caption s-muted">Proposé par {i.invitedBy}</span>}
                </div>
                <div className="s-row">
                  {(["staff_accept", "staff_decline"] as const).map((intent) => (
                    <Form method="post" key={intent}>
                      <input type="hidden" name="intent" value={intent} />
                      <input type="hidden" name="structureId" value={i.structureId} />
                      <Button
                        type="submit"
                        variant="secondary"
                        icon={intent === "staff_accept" ? "check" : "close"}
                        loading={busy}
                      >
                        {intent === "staff_accept" ? messagingLabels.accept : messagingLabels.decline}
                      </Button>
                    </Form>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {crews.length > 0 && (
        <section className="s-section" aria-labelledby="crews-titre">
          <h2 id="crews-titre" className="s-h2">
            {crewLabels.crewRequests}
          </h2>
          <ul className="s-people">
            {crews.map((r) => (
              <li
                key={`${r.kind}-${r.crew.id}-${r.person.userId}`}
                className="s-person"
                data-testid={`request-crew-${r.kind}`}
              >
                <CrewLogo url={r.crew.logoUrl} name={r.crew.name} size={44} />
                <div className="s-person__main">
                  <span className="s-label o-t-label">
                    {r.kind === "request"
                      ? crewLabels.requestFrom(r.person.pseudo, r.crew.name)
                      : crewLabels.invitationFrom(r.crew.name)}
                  </span>
                  <a className="o-t-title o-never-truncate" href={`/c/${r.crew.slug}`}>
                    {r.crew.name}
                  </a>
                  {r.kind === "invitation" && (
                    <span className="o-t-caption s-muted">{crewLabels.leaderOf(r.person.pseudo)}</span>
                  )}
                  {r.message && <p className="o-t-caption s-muted s-prewrap">{r.message}</p>}
                </div>
                <div className="s-row">
                  <Form method="post">
                    <input
                      type="hidden"
                      name="intent"
                      value={r.kind === "request" ? "crew_request_accept" : "crew_invitation_accept"}
                    />
                    <input type="hidden" name="crewId" value={r.crew.id} />
                    <input type="hidden" name="userId" value={r.person.userId} />
                    <Button type="submit" variant="secondary" icon="check" loading={busy}>
                      {crewLabels.accept}
                    </Button>
                  </Form>
                  <Form method="post">
                    <input
                      type="hidden"
                      name="intent"
                      value={r.kind === "request" ? "crew_request_decline" : "crew_invitation_decline"}
                    />
                    <input type="hidden" name="crewId" value={r.crew.id} />
                    <input type="hidden" name="userId" value={r.person.userId} />
                    <Button type="submit" variant="secondary" icon="close" loading={busy}>
                      {crewLabels.decline}
                    </Button>
                  </Form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {contactsOut.length > 0 && (
        <section className="s-section" aria-labelledby="envoyees-titre">
          <h2 id="envoyees-titre" className="s-h2">
            Demandes de contact envoyées
          </h2>
          <ul className="s-people">
            {contactsOut.map((r) => (
              <li key={r.id} className="s-person" data-testid="request-contact-out">
                <Person p={r.person} />
                <span className="o-t-caption s-muted">{messagingLabels.pendingOut}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
