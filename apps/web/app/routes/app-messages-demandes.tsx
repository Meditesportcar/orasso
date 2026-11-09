import { Button, Chip } from "@orasso/design-system/web";
import {
  type ContactAcceptResult,
  type ContactRequestView,
  gradeLabels,
  type InboxSummary,
  inboxRowCounts,
  messagingLabels,
} from "@orasso/shared";
import { data, Form, redirect, useNavigation } from "react-router";

import { PersonAvatar } from "../components/People";
import { api, apiOrThrow, requireMe } from "../lib/api.server";
import type { Route } from "./+types/app-messages-demandes";

// Messages > Demandes de message (lot 18, repris au lot R7c2 ; maquette R7.3 `mg:dem`) : les messages de personnes que tu ne
// suis pas (règle de contact de R6). Le message est affiché ; accepter ouvre la conversation, refuser l'efface sans
// prévenir. Les demandes envoyées en attente restent listées dessous.
export function meta() {
  return [{ title: "Demandes de message · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireMe(request);
  const [contacts, summary] = await Promise.all([
    apiOrThrow<{ items: ContactRequestView[] }>(request, "/me/contact-requests"),
    api<InboxSummary>(request, "/me/inbox/summary"),
  ]);
  return {
    contactsIn: contacts.items.filter((c) => c.direction === "in"),
    contactsOut: contacts.items.filter((c) => c.direction === "out"),
    messageRequests: inboxRowCounts(summary.ok ? summary.data : null).messageRequests,
  };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const id = encodeURIComponent(String(form.get("id") ?? ""));
  if (intent === "contact_accept") {
    const res = await api<ContactAcceptResult>(request, `/contact-requests/${id}/accept`, { method: "POST" });
    if (res.ok) throw redirect(`/app/messages/${res.data.conversationId}`);
    return data({ formError: res.error.message }, { status: res.status });
  }
  if (intent === "contact_decline") {
    const res = await api(request, `/contact-requests/${id}/decline`, { method: "POST" });
    if (!res.ok) return data({ formError: res.error.message }, { status: res.status });
    return data({ formError: null as string | null });
  }
  return data({ formError: "Action inconnue." }, { status: 400 });
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

export default function MessageRequests({ loaderData, actionData }: Route.ComponentProps) {
  const { contactsIn, contactsOut, messageRequests } = loaderData;
  const busy = useNavigation().state !== "idle";
  return (
    <div className="s-narrow s-stack" data-testid="demandes">
      <h1 className="s-title">{messagingLabels.messageRequests}</h1>
      <p className="o-t-caption s-muted">
        {messageRequests > 0 ? `${messageRequests} en attente · ` : ""}Ils ne savent pas que tu as lu tant que tu
        n'acceptes pas. Accepter ouvre la conversation ; refuser l'efface, sans prévenir.
      </p>
      <div>
        <Button variant="secondary" icon="back" href="/app/messages" data-testid="requests-back">
          Retour aux messages
        </Button>
      </div>
      {actionData?.formError && (
        <p className="s-error" role="alert">
          {actionData.formError}
        </p>
      )}
      {contactsIn.length === 0 && <p className="s-notice">{messagingLabels.noRequests}</p>}
      {contactsIn.length > 0 && (
        <ul className="s-people">
          {contactsIn.map((r) => (
            <li key={r.id} className="s-person" data-testid="request-contact">
              <PersonAvatar url={r.person.avatarUrl} pseudo={r.person.pseudo} size={44} />
              <div className="s-person__main">
                <a className="s-person__name o-t-title" href={`/u/${encodeURIComponent(r.person.pseudo)}`}>
                  {r.person.pseudo}
                </a>
                <Chip>{gradeLabels[r.person.grade]}</Chip>
              </div>
              <div className="s-person__main">
                <span className="s-label o-t-label">{messagingLabels.contactRequestFrom}</span>
                <p className="s-prewrap">{r.message}</p>
              </div>
              <Decide id={r.id} busy={busy} />
            </li>
          ))}
        </ul>
      )}
      {contactsOut.length > 0 && (
        <section className="s-section" aria-labelledby="envoyees-titre">
          <h2 id="envoyees-titre" className="s-h2">
            Demandes de contact envoyées
          </h2>
          <ul className="s-people">
            {contactsOut.map((r) => (
              <li key={r.id} className="s-person" data-testid="request-contact-out">
                <PersonAvatar url={r.person.avatarUrl} pseudo={r.person.pseudo} size={44} />
                <div className="s-person__main">
                  <a className="s-person__name o-t-title" href={`/u/${encodeURIComponent(r.person.pseudo)}`}>
                    {r.person.pseudo}
                  </a>
                  <Chip>{gradeLabels[r.person.grade]}</Chip>
                </div>
                <span className="o-t-caption s-muted">{messagingLabels.pendingOut}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
