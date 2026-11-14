import { Button, Icon } from "@orasso/design-system/web";
import { albumTagLabels, type ConversationSummary, conversationTag, messagingLabels } from "@orasso/shared";
import { useContext, useEffect, useRef, useState } from "react";
import { Form, UNSAFE_DataRouterContext, useActionData, useLocation, useNavigate, useNavigation } from "react-router";

import { contactMediaCall, createContactMediaController } from "../lib/contactMedia";
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
 * L'enchaînement « Contacter <média> » depuis « Tes photos » (lot R9i) : un seul par écran, partagé par le bouton de l'en-tête et la
 * rangée de la feuille. Le contrôleur (`createContactMediaController`) lit l'état du routeur de données lui-même ; périmé au démontage, à
 * la perte de la session (`stale`, changement de compte) et dès qu'une navigation vers une autre adresse commence. Sans clé de média
 * (page pas encore chargée), `open` ne fait rien.
 */
export function useContactMedia(mediaKey: string | null, onError: (message: string | null) => void, stale = false) {
  const navigate = useNavigate();
  const location = useLocation();
  // `UNSAFE_DataRouterContext` : seul accès au routeur lui-même (son état change avant le rendu, `useNavigation()` après) ; limite au journal.
  const router = useContext(UNSAFE_DataRouterContext)?.router;
  const [busy, setBusy] = useState(false);
  const latest = useRef({ navigate, onError, router, pathname: location.pathname });
  latest.current = { navigate, onError, router, pathname: location.pathname };
  const controller = useRef<ReturnType<typeof createContactMediaController> | null>(null);
  if (!controller.current) {
    controller.current = createContactMediaController({
      // Jamais absent sous `<HydratedRouter>` ; sans routeur de données, au repos sur l'adresse rendue (`useLocation`) : la garde ne voit
      // aucun départ et la conversation s'ouvre, au lieu de jeter toute réponse faute d'adresse connue.
      router: {
        get state() {
          return latest.current.router?.state ?? idleRouterState(latest.current.pathname);
        },
        subscribe: (l) => latest.current.router?.subscribe(l) ?? (() => undefined),
      },
      navigate: (to) => latest.current.navigate(to),
      onError: (m) => latest.current.onError(m),
      setBusy,
    });
  }
  useEffect(() => {
    const c = controller.current;
    return () => c?.cancel();
  }, []);
  useEffect(() => {
    if (stale) controller.current?.cancel();
  }, [stale]);
  const open = () => {
    if (!mediaKey) return;
    const call = contactMediaCall(mediaKey);
    if (!call) return;
    void controller.current?.open(call, location.pathname);
  };
  return { busy, open };
}

const idleRouterState = (pathname: string) => ({ location: { pathname }, navigation: { state: "idle" as const } });

/** Le bouton de l'en-tête (`header`) ou la rangée de la feuille d'une photo (`row`) : l'enchaînement vient de `useContactMedia`. */
export function ContactMedia({
  name,
  variant,
  busy,
  onOpen,
}: {
  name: string;
  variant: "header" | "row";
  busy: boolean;
  onOpen: () => void;
}) {
  if (variant === "row") {
    return (
      <button
        type="button"
        className="myp-sheet__row"
        disabled={busy}
        onClick={onOpen}
        data-testid="photo-sheet-contact"
      >
        <Icon name="chat" size={20} />
        <span>
          <strong>{albumTagLabels.contactName(name)}</strong>
          <span className="o-t-caption s-muted">{albumTagLabels.messageAboutPhoto}</span>
        </span>
      </button>
    );
  }
  return (
    <Button
      type="button"
      variant="secondary"
      icon="chat"
      loading={busy}
      onClick={onOpen}
      data-testid="my-photos-contact"
    >
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
