import { Button, Icon } from "@orasso/design-system/web";
import {
  albumTagLabels,
  type ConversationSummary,
  conversationTag,
  createContactMediaFlow,
  messagingLabels,
} from "@orasso/shared";
import { useEffect, useRef, useState } from "react";
import { Form, useActionData, useNavigate, useNavigation } from "react-router";

import { contactMediaCall } from "../lib/contactMedia";
import { formatDay, formatTime } from "../lib/format";
import { PersonAvatar } from "./People";

// Messagerie du site (lot 18) : bouton « Contacter l'organisateur » et ligne de conversation (lot R7c2 : plus de segments de
// la Boîte, elle a disparu : les Messages ne sont que des conversations).

/** « Contacter l'organisateur » : toujours possible (docs/01) ; déconnecté, renvoie à la connexion puis ici. */
export function ContactOrganizer({
  structureId,
  connected,
  retour,
  about,
}: {
  structureId: string;
  connected: boolean;
  retour: string;
  /** Lot M4 : écrit depuis la fiche d'un événement : le message part avec le contexte « À propos de ». */
  about?: { eventId: string; title: string; when: string; structureName: string };
}) {
  const busy = useNavigation().state !== "idle";
  const action = useActionData() as
    | { messageError?: string | null; pending?: { clientId: string; body: string } | null }
    | undefined;
  // Tour 2 : un identifiant par message, créé par la page et gardé jusqu'à la confirmation (l'envoi suivant d'une
  // réponse perdue repart avec lui). Sans JavaScript, le serveur en crée un.
  const pending = action?.pending ?? null;
  const [clientId, setClientId] = useState("");
  useEffect(() => {
    setClientId((current) => pending?.clientId ?? (current || crypto.randomUUID()));
  }, [pending?.clientId]);
  if (!connected) {
    return (
      <Button variant="secondary" icon="chat" href={`/connexion?retour=${encodeURIComponent(retour)}`} fullWidth>
        {messagingLabels.contactOrganizer}
      </Button>
    );
  }
  if (about) {
    return (
      <Form method="post" className="s-stack s-stack--tight" id="ecrire" data-testid="write-organizer">
        <input type="hidden" name="intent" value="contact_organizer" />
        <input type="hidden" name="structureId" value={structureId} />
        <input type="hidden" name="aboutEventId" value={about.eventId} />
        <input type="hidden" name="clientId" value={clientId} />
        <strong>{messagingLabels.writeTo(about.structureName)}</strong>
        <div className="s-about" data-testid="write-about">
          <small className="o-t-label">{messagingLabels.aboutEvent}</small>
          <strong>{about.title}</strong>
          <span className="o-t-caption s-muted">{about.when}</span>
        </div>
        <p className="o-t-caption s-muted">{messagingLabels.aboutEventHint}</p>
        <label className="o-t-label" htmlFor="write-body">
          {messagingLabels.yourMessage}
        </label>
        <textarea
          key={pending?.clientId ?? "new"}
          id="write-body"
          name="body"
          className="s-textarea"
          rows={3}
          maxLength={2000}
          required
          defaultValue={pending?.body}
          readOnly={Boolean(pending)}
        />
        {pending ? (
          <p className="o-t-caption s-muted" data-testid="write-pending">
            {messagingLabels.sendPending}
          </p>
        ) : null}
        <Button type="submit" variant="secondary" icon="send" loading={busy} fullWidth data-testid="contact-organizer">
          Envoyer
        </Button>
        {action?.messageError && (
          <p className="s-error" role="alert">
            {action.messageError}
          </p>
        )}
      </Form>
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

/**
 * « Contacter <média> » depuis « Tes photos » (lot R9i, partie 2) : ouvre ou rouvre la conversation de la page du média, montrée
 * sous son nom et son logo (jamais le compte qui la tient). `header` : le bouton de l'en-tête ; `row` : la rangée de la feuille
 * d'une photo. Le refus de l'API (403, 404) est dit par le libellé de l'API, rendu par l'écran (`onError`).
 */
export function ContactMedia({
  mediaKey,
  name,
  variant,
  onError,
}: {
  mediaKey: string;
  name: string;
  variant: "header" | "row";
  onError: (message: string | null) => void;
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  // Une opération à la fois, périmée au démontage (retour arrière, autre écran) : sa réponse tardive n'ouvre rien et ne dit rien.
  const flow = useRef(createContactMediaFlow());
  useEffect(() => {
    const f = flow.current;
    return () => f.cancel();
  }, []);
  const open = () => {
    const call = contactMediaCall(mediaKey);
    if (!call) return;
    void flow.current.open(call, {
      setBusy,
      onError,
      navigate: (id) => navigate(`/app/messages/${id}`),
    });
  };
  if (variant === "row") {
    return (
      <button type="button" className="myp-sheet__row" disabled={busy} onClick={open} data-testid="photo-sheet-contact">
        <Icon name="chat" size={20} />
        <span>
          <strong>{albumTagLabels.contactName(name)}</strong>
          <span className="o-t-caption s-muted">{albumTagLabels.messageAboutPhoto}</span>
        </span>
      </button>
    );
  }
  return (
    <Button type="button" variant="secondary" icon="chat" loading={busy} onClick={open} data-testid="my-photos-contact">
      {albumTagLabels.contact}
    </Button>
  );
}

const whenOf = (iso: string) => {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString() ? formatTime(iso) : formatDay(iso);
};

/**
 * Une conversation de la liste : avatar, titre et son étiquette (« Organisateur », « Crew », « Réponse à ta story »), heure,
 * aperçu, pastille de non lu (moutarde à plat, sans néon). La vignette d'une réponse à une story n'est montrée que si l'API
 * la sert (la story existe encore) ; elle passe par la route protégée, comme l'image d'un message.
 */
export function ConversationRow({ c, href }: { c: ConversationSummary; href?: string }) {
  const tag = conversationTag(c);
  return (
    <li>
      <a
        href={href ?? `/app/messages/${c.id}`}
        className="s-convo"
        data-testid="conversation-row"
        data-unread={c.unreadCount}
        data-kind={c.kind}
      >
        <PersonAvatar url={c.avatarUrl} pseudo={c.title} size={44} />
        <span className="s-convo__main">
          <span className="s-row s-row--between">
            <span className="s-convo__name">
              <span className="o-t-title s-convo__title">{c.title}</span>
              {tag ? (
                <span className="s-convo__tag o-t-label" data-testid="conversation-tag">
                  {tag}
                </span>
              ) : null}
            </span>
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
        {c.storyThumbUrl ? <StoryThumb url={c.storyThumbUrl} /> : null}
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

/** Vignette d'une story à laquelle répond le dernier message (l'image est celle de la story, déjà floutée côté API). */
function StoryThumb({ url }: { url: string }) {
  return <img className="s-convo__thumb" src={url} alt={messagingLabels.tagStoryReply} loading="lazy" />;
}
