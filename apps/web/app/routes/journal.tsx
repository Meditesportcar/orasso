import { Button, Chip } from "@orasso/design-system/web";
import {
  type ConversationSummary,
  eventInviteLabels,
  messagingLabels,
  notificationFamilyLabels,
  socialLabels,
} from "@orasso/shared";
import type { ReactNode } from "react";
import { data, Form, redirect, useLocation, useNavigation } from "react-router";

import { InviteMenu } from "../components/EventInvite";
import { ConversationRow, InboxSegments } from "../components/Messaging";
import { PersonAvatar } from "../components/People";
import { api } from "../lib/api.server";
import { muteInviterAction } from "../lib/eventInvite.server";
import { formatDay, formatTime } from "../lib/format";
import { byRecent } from "../lib/inbox-feed";
import { type JournalItem, loadJournal } from "../lib/journal.server";
import type { Route } from "./+types/journal";

// Journal (lot 17, ARCHITECTURE-SUITE § 2.4) : le fil d'actualité des personnes suivies et les notifications, dans un seul fil
// chronologique. 7 jours en arrière, sauf ce qui n'a pas été lu. Lot C5 : c'est le segment « Tout » de la Boîte.
export function meta() {
  return [{ title: "Boîte · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  return loadJournal(request, false);
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  if (intent === "read_all") {
    const res = await api(request, "/me/notifications/read", { method: "POST", json: { all: true } });
    if (!res.ok) return data({ error: res.error.message }, { status: res.status });
    // Lot R7a1 : la page Le Fil (`/app/fil`) rend ce même Journal et lui renvoie son formulaire.
    const here = new URL(request.url).pathname;
    return redirect(here === "/app/fil" ? here : "/app/journal");
  }
  // Lot R6c : couper les invitations d'une personne (« ⋯ » d'une notification d'invitation).
  if (intent === "invite_mute") {
    const res = await muteInviterAction(request, form);
    return data(
      { error: res.data.inviteError ?? null, notice: res.data.inviteNotice ?? null },
      { status: res.init?.status ?? 200 },
    );
  }
  return data({ error: "Action inconnue." }, { status: 400 });
}

const pathOf = (item: JournalItem): string | null => {
  const raw = item.data.link ?? item.data.screen ?? null;
  return raw?.startsWith("/") && !raw.startsWith("//") ? raw : null;
};

/** Une notification du fil (lien vers son écran quand elle en a un). */
function JournalRow({ item }: { item: JournalItem }) {
  const path = pathOf(item);
  const actor = item.data.actor;
  const content = (
    <>
      {actor ? (
        <PersonAvatar url={actor.avatarUrl} pseudo={actor.pseudo} size={40} />
      ) : (
        <span className="s-journal__dot" aria-hidden="true" />
      )}
      <div className="s-journal__main">
        <strong className="s-journal__title">{item.title}</strong>
        {item.body && (
          // Une invitation : la date et le lieu, puis chaque mot sur sa ligne (« Kenji_66 : « … » »).
          <span className={`s-journal__body${item.type === "event_invited" ? " s-prewrap" : ""}`}>{item.body}</span>
        )}
        <span className="o-t-caption s-muted">
          {formatDay(item.createdAt)} · {formatTime(item.createdAt)} · {notificationFamilyLabels[item.family]}
        </span>
      </div>
      {!item.readAt && <Chip>Nouveau</Chip>}
    </>
  );
  // Lot R6c (R6.6) : une invitation à un événement garde son titre et son corps ; « Voir la fiche » et « ⋯ » dessous
  // (un lien ne peut pas contenir le menu).
  if (item.type === "event_invited") {
    return (
      <li className="s-journal__item" data-testid="journal-item" data-type={item.type} data-read={Boolean(item.readAt)}>
        <div className="s-journal__link">{content}</div>
        <div className="ri-notif-acts">
          {path && (
            <Button variant="secondary" icon="next" href={path} data-testid="notif-invite-open">
              {eventInviteLabels.seeEvent}
            </Button>
          )}
          {actor && (
            <InviteMenu inviters={item.data.actors?.length ? item.data.actors : [actor]} testId="notif-invite-more" />
          )}
        </div>
      </li>
    );
  }
  return (
    <li className="s-journal__item" data-testid="journal-item" data-type={item.type} data-read={Boolean(item.readAt)}>
      {path ? (
        <a className="s-journal__link" href={path}>
          {content}
        </a>
      ) : (
        <div className="s-journal__link">{content}</div>
      )}
    </li>
  );
}

/**
 * Le Journal, tel que le rend la Boîte (segment « Tout ») ; depuis le lot R7a1, l'onglet Le Fil (`/app/fil`, coquille en
 * attendant le lot R7e2) l'affiche aussi, sous son titre et sans les segments de la Boîte.
 */
export function JournalView({
  loaderData,
  actionData,
  title,
  segments = true,
}: Pick<Route.ComponentProps, "loaderData" | "actionData"> & { title: string; segments?: boolean }) {
  const { items, nextCursor, summary, conversations, requests, unavailable } = loaderData;
  const busy = useNavigation().state !== "idle";
  const here = useLocation().pathname;
  const unread = items.filter((i) => !i.readAt).length;
  const feed: { at: string; node: ReactNode }[] = byRecent<{ at: string; node: ReactNode }>(
    conversations.map((c: ConversationSummary) => ({
      at: c.lastMessage?.at ?? "",
      node: <ConversationRow key={c.id} c={c} />,
    })),
    requests.map((r) => ({
      at: r.at,
      node: (
        <li key={r.id}>
          <a className="s-convo" href="/app/boite/demandes" data-testid="inbox-request">
            <div className="s-convo__main">
              <strong>{r.pseudo}</strong>
              <span className="s-muted">{r.text}</span>
            </div>
            <Chip>{messagingLabels.requests}</Chip>
          </a>
        </li>
      ),
    })),
    items.map((item) => ({ at: item.createdAt, node: <JournalRow key={item.id} item={item} /> })),
  );
  return (
    <div className="s-narrow s-stack" data-testid="journal">
      <h1 className="s-title">{title}</h1>
      {segments ? (
        <InboxSegments
          active="all"
          messages={summary.unreadMessages}
          requests={Object.values(summary.requests).reduce((a, b) => a + b, 0)}
        />
      ) : null}
      <div className="s-row s-row--between">
        <h2 className="s-h2">{socialLabels.journal}</h2>
        {unread > 0 && segments && (
          <Form method="post">
            <input type="hidden" name="intent" value="read_all" />
            <Button type="submit" variant="secondary" icon="check" loading={busy}>
              {socialLabels.markAllRead}
            </Button>
          </Form>
        )}
      </div>
      {actionData?.error && (
        <p className="s-error" role="alert">
          {actionData.error}
        </p>
      )}
      {actionData && "notice" in actionData && actionData.notice && (
        <p className="s-notice s-notice--ok" role="status" data-testid="journal-notice">
          {actionData.notice}
        </p>
      )}
      {(unavailable.messages || unavailable.requests) && (
        <div className="s-notice s-row s-row--between" role="alert" data-testid="inbox-unavailable">
          <span>
            {unavailable.messages && unavailable.requests
              ? "Messages et demandes indisponibles pour le moment."
              : unavailable.messages
                ? "Messages indisponibles pour le moment."
                : "Demandes indisponibles pour le moment."}
          </span>
          <Button variant="secondary" icon="undo" href={here} data-testid="inbox-retry">
            Réessayer
          </Button>
        </div>
      )}
      {feed.length === 0 ? (
        <p className="s-notice">{socialLabels.journalEmpty}</p>
      ) : (
        // Relecture C4a (lot C7) : messages, demandes et notifications dans un seul fil, du plus récent au plus ancien.
        <ul className="s-journal" data-testid="inbox-all">
          {feed.map((x) => x.node)}
        </ul>
      )}
      {nextCursor && (
        <Button variant="secondary" icon="next" href={`${here}?suite=${encodeURIComponent(nextCursor)}`}>
          Plus ancien
        </Button>
      )}
    </div>
  );
}

export default function Journal({ loaderData, actionData }: Route.ComponentProps) {
  return <JournalView loaderData={loaderData} actionData={actionData} title={messagingLabels.inbox} />;
}
