import { Button, Chip } from "@orasso/design-system/web";
import { type ConversationSummary, messagingLabels } from "@orasso/shared";
import { Form, useActionData, useNavigation } from "react-router";

import { formatDay, formatTime } from "../lib/format";
import { PersonAvatar } from "./People";

// Messagerie du site (lot 18) : bouton « Contacter l'organisateur », ligne de conversation, segments de la Boîte.

/** « Contacter l'organisateur » : toujours possible (docs/01) ; déconnecté, renvoie à la connexion puis ici. */
export function ContactOrganizer({
  structureId,
  connected,
  retour,
}: {
  structureId: string;
  connected: boolean;
  retour: string;
}) {
  const busy = useNavigation().state !== "idle";
  const action = useActionData() as { messageError?: string | null } | undefined;
  if (!connected) {
    return (
      <Button variant="secondary" icon="chat" href={`/connexion?retour=${encodeURIComponent(retour)}`} fullWidth>
        {messagingLabels.contactOrganizer}
      </Button>
    );
  }
  return (
    <Form method="post" className="s-stack s-stack--tight">
      <input type="hidden" name="intent" value="contact_organizer" />
      <input type="hidden" name="structureId" value={structureId} />
      <Button type="submit" variant="secondary" icon="chat" loading={busy} fullWidth data-testid="contact-organizer">
        {messagingLabels.contactOrganizer}
      </Button>
      {action?.messageError && (
        <p className="s-error" role="alert">
          {action.messageError}
        </p>
      )}
    </Form>
  );
}

/** Segments Messages / Demandes avec leur compteur. */
export function InboxSegments({
  active,
  messages,
  requests,
}: {
  active: "messages" | "requests";
  messages: number;
  requests: number;
}) {
  return (
    <nav className="s-tabs" aria-label={messagingLabels.inbox}>
      <a href="/app/boite" className="s-chip-link" aria-current={active === "messages" ? "page" : undefined}>
        <Chip selected={active === "messages"}>
          {messagingLabels.messages}
          {messages > 0 ? ` · ${messages}` : ""}
        </Chip>
      </a>
      <a href="/app/boite/demandes" className="s-chip-link" aria-current={active === "requests" ? "page" : undefined}>
        <Chip selected={active === "requests"} data-testid="segment-requests">
          {messagingLabels.requests}
          {requests > 0 ? ` · ${requests}` : ""}
        </Chip>
      </a>
    </nav>
  );
}

const whenOf = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? formatTime(iso) : formatDay(iso);
};

/** Une conversation de la liste : avatar, titre, heure, aperçu, pastille de non lu (moutarde à plat, sans néon). */
export function ConversationRow({ c, href }: { c: ConversationSummary; href?: string }) {
  return (
    <li>
      <a
        href={href ?? `/app/boite/${c.id}`}
        className="s-convo"
        data-testid="conversation-row"
        data-unread={c.unreadCount}
      >
        <PersonAvatar url={c.avatarUrl} pseudo={c.title} size={44} />
        <span className="s-convo__main">
          <span className="s-row s-row--between">
            <span className="o-t-title s-convo__title">{c.title}</span>
            {c.lastMessage && <span className="o-t-caption s-muted">{whenOf(c.lastMessage.at)}</span>}
          </span>
          {c.subtitle && <span className="o-t-caption s-muted">{c.subtitle}</span>}
          {c.lastMessage && (
            <span className="o-t-caption s-convo__preview">
              {c.lastMessage.mine ? "Toi : " : ""}
              {c.lastMessage.preview}
            </span>
          )}
        </span>
        {c.unreadCount > 0 && (
          <span className="s-convo__count o-t-credit">
            {c.unreadCount}
            <span className="o-visually-hidden"> non lus</span>
          </span>
        )}
      </a>
    </li>
  );
}
