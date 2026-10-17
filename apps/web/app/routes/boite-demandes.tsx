import { Button, Chip } from "@orasso/design-system/web";
import {
  type ContactAcceptResult,
  type ContactRequestView,
  type CrewConfirmationRequest,
  type CrewInboxRequest,
  crewLabels,
  type FriendRequestView,
  gradeLabels,
  type InboxSummary,
  invitationLabels,
  messagingLabels,
  type ReceivedInvitation,
} from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";

import { CrewLogo } from "../components/Crews";
import { InboxSegments } from "../components/Messaging";
import { PersonAvatar } from "../components/People";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import { crewAction, isCrewIntent } from "../lib/crews.server";
import { formatDateTime } from "../lib/format";
import { friendAction, isFriendIntent } from "../lib/friends.server";
import type { Route } from "./+types/boite-demandes";

// Boîte > Demandes (lot 18) : rangées à part — demandes d'ami (lot 17) et demandes de contact (le message est
// affiché, on accepte ou on refuse ; le refus est silencieux). Les lots 19 et suivants ajoutent leurs sortes ici.
export function meta() {
  return [{ title: "Demandes · Boîte · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireMe(request);
  const [friends, contacts, summary, crews, confirmations] = await Promise.all([
    apiOrThrow<{ items: FriendRequestView[] }>(request, "/me/friends/requests?direction=in"),
    apiOrThrow<{ items: ContactRequestView[] }>(request, "/me/contact-requests"),
    apiOrThrow<InboxSummary>(request, "/me/inbox/summary"),
    // Crews (lot 19) : demandes reçues par un chef, invitations reçues, venues en crew à confirmer.
    apiOrThrow<CrewInboxRequest[]>(request, "/me/crew-requests"),
    apiOrThrow<CrewConfirmationRequest[]>(request, "/me/crew-confirmations"),
  ]);
  // Invitations à un événement (lot 25) : la réponse (avec le choix du véhicule) se fait dans Accès.
  const invitations = await api<ReceivedInvitation[]>(request, "/me/event-invitations");
  return {
    friends: friends.items,
    contactsIn: contacts.items.filter((c) => c.direction === "in"),
    contactsOut: contacts.items.filter((c) => c.direction === "out"),
    summary,
    crews,
    confirmations,
    invitations: invitations.ok ? invitations.data : [],
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (isFriendIntent(intent)) return friendAction(request, form);
  if (isCrewIntent(intent)) {
    const res = await crewAction(request, form);
    return data({ friendError: res.data.crewError }, { status: res.init?.status ?? 200 });
  }
  const id = encodeURIComponent(String(form.get("id") ?? ""));
  if (intent === "contact_accept") {
    const res = await api<ContactAcceptResult>(request, `/contact-requests/${id}/accept`, { method: "POST" });
    if (res.ok) throw redirect(`/app/boite/${res.data.conversationId}`);
    return data({ friendError: res.error.message }, { status: res.status });
  }
  if (intent === "contact_decline") {
    const res = await api(request, `/contact-requests/${id}/decline`, { method: "POST" });
    if (!res.ok) return data({ friendError: res.error.message }, { status: res.status });
    return data({ friendError: null as string | null });
  }
  return data({ friendError: "Action inconnue." }, { status: 400 });
}

function Person({ p }: { p: FriendRequestView["person"] }) {
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

function Decide({ intentPrefix, id, busy }: { intentPrefix: "friend" | "contact"; id: string; busy: boolean }) {
  return (
    <div className="s-row">
      <Form method="post">
        <input type="hidden" name="intent" value={`${intentPrefix}_accept`} />
        <input type="hidden" name="id" value={id} />
        <Button type="submit" variant="secondary" icon="check" loading={busy}>
          {messagingLabels.accept}
        </Button>
      </Form>
      <Form method="post">
        <input type="hidden" name="intent" value={`${intentPrefix}_decline`} />
        <input type="hidden" name="id" value={id} />
        <Button type="submit" variant="secondary" icon="close" loading={busy}>
          {messagingLabels.decline}
        </Button>
      </Form>
    </div>
  );
}

export default function Demandes({ loaderData, actionData }: Route.ComponentProps) {
  const { friends, contactsIn, contactsOut, summary, crews, confirmations, invitations } = loaderData;
  const busy = useNavigation().state !== "idle";
  const requests = Object.values(summary.requests).reduce((a, b) => a + b, 0);
  const empty =
    friends.length === 0 &&
    contactsIn.length === 0 &&
    crews.length === 0 &&
    confirmations.length === 0 &&
    invitations.length === 0;
  return (
    <div className="s-narrow s-stack" data-testid="demandes">
      <h1 className="s-title">{messagingLabels.inbox}</h1>
      <InboxSegments active="requests" messages={summary.unreadMessages} requests={requests} />
      {actionData?.friendError && (
        <p className="s-error" role="alert">
          {actionData.friendError}
        </p>
      )}
      {empty && <p className="s-notice">{messagingLabels.noRequests}</p>}
      {(friends.length > 0 || contactsIn.length > 0) && (
        <ul className="s-people">
          {friends.map((r) => (
            <li key={r.id} className="s-person" data-testid="request-friend">
              <Person p={r.person} />
              <div className="s-person__main">
                <span className="s-label o-t-label">{messagingLabels.friendRequestFrom}</span>
                {r.message && <p className="o-t-caption s-muted s-prewrap">{r.message}</p>}
              </div>
              <Decide intentPrefix="friend" id={r.id} busy={busy} />
            </li>
          ))}
          {contactsIn.map((r) => (
            <li key={r.id} className="s-person" data-testid="request-contact">
              <Person p={r.person} />
              <div className="s-person__main">
                <span className="s-label o-t-label">{messagingLabels.contactRequestFrom}</span>
                <p className="s-prewrap">{r.message}</p>
              </div>
              <Decide intentPrefix="contact" id={r.id} busy={busy} />
            </li>
          ))}
        </ul>
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
                <Button variant="secondary" icon="entry" href="/app/acces">
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
                <Button variant="secondary" icon="qr" href="/app/acces">
                  {crewLabels.confirmVenue}
                </Button>
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
