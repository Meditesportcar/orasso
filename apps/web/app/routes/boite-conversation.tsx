import { Button } from "@orasso/design-system/web";
import {
  type ConversationView,
  MESSAGE_BODY_MAX,
  type MessagePage,
  type MessageView,
  messagingLabels,
  moderationLabels,
  systemMessageText,
  type UploadResult,
} from "@orasso/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { FicheBar, ficheHandle } from "../components/FicheBar";
import { PersonAvatar } from "../components/People";
import { ReportDialog } from "../components/ReportDialog";
import { apiFetch } from "../lib/api.client";
import { apiOrThrow, requireMe } from "../lib/api.server";
import { formatDay, formatTime } from "../lib/format";
import { useChannel } from "../lib/useChannel";
import type { Route } from "./+types/boite-conversation";

// Conversation (lot 18) : messages en direct (`conversation:{id}`), envoi idempotent par `clientId` avec nouvel essai
// tant que la page est ouverte (S13), image, « Lu par … » (S9), suppression de ses messages.
// Lot M7 : fiche ou parcours, mode B (en-tête de fiche, sans bande ni barre d'onglets).
export const handle = ficheHandle;

export function meta() {
  return [{ title: "Conversation · Orasso" }, { name: "robots", content: "noindex" }];
}

export async function loader({ request, params }: Route.LoaderArgs) {
  const me = await requireMe(request);
  const id = encodeURIComponent(params.id);
  const [conversation, page] = await Promise.all([
    apiOrThrow<ConversationView>(request, `/conversations/${id}`),
    apiOrThrow<MessagePage>(request, `/conversations/${id}/messages`),
  ]);
  return { me: { userId: me.user.id, pseudo: me.profile.pseudo }, conversation, page };
}

type Pending = { clientId: string; body?: string; imageKey?: string; failed: boolean; error?: string };

/** Ordre chronologique (l'API rend du plus récent au plus ancien). */
const chronological = (items: MessageView[]) => [...items].reverse();

export default function Conversation({ loaderData }: Route.ComponentProps) {
  const { me, conversation: c } = loaderData;
  const [items, setItems] = useState<MessageView[]>(() => chronological(loaderData.page.items));
  const [older, setOlder] = useState<string | null>(loaderData.page.nextCursor);
  const [pending, setPending] = useState<Pending[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lastRead = useRef<string | null>(null);

  // Mon côté : mes messages, ou ceux de ma structure quand je réponds en son nom.
  const mySide = useCallback(
    (m: MessageView) => (c.side === "structure" ? m.asStructure : m.sender?.userId === me.userId),
    [c.side, me.userId],
  );

  useChannel(`conversation:${c.id}`, (event) => {
    if (event.type === "message.new") {
      const m = (event.payload as { message: MessageView }).message;
      const own = m.sender?.userId === me.userId;
      setItems((list) =>
        list.some((x) => x.id === m.id) ? list : [...list, { ...m, mine: own, readBy: mySide(m) ? [] : null }],
      );
      if (m.clientId) setPending((list) => list.filter((p) => p.clientId !== m.clientId));
    } else if (event.type === "message.read") {
      const r = event.payload as { userId: string; pseudo: string; lastReadMessageId: string };
      if (r.userId === me.userId) return;
      setItems((list) => {
        const upTo = list.findIndex((m) => m.id === r.lastReadMessageId);
        if (upTo < 0) return list;
        return list.map((m, i) =>
          i <= upTo && m.readBy && !m.readBy.some((x) => x.userId === r.userId) && m.sender?.userId !== r.userId
            ? { ...m, readBy: [...m.readBy, { userId: r.userId, pseudo: r.pseudo }] }
            : m,
        );
      });
    } else if (event.type === "message.deleted") {
      const { messageId } = event.payload as { messageId: string };
      setItems((list) => list.map((m) => (m.id === messageId ? { ...m, deleted: true, body: null, image: null } : m)));
    }
  });

  // Lecture : le dernier message de l'autre côté est marqué lu quand la page est visible.
  useEffect(() => {
    const last = [...items].reverse().find((m) => !mySide(m));
    if (!last || lastRead.current === last.id) return;
    const mark = () => {
      if (document.visibilityState !== "visible" || lastRead.current === last.id) return;
      lastRead.current = last.id;
      void apiFetch(`/conversations/${c.id}/read`, { method: "POST", json: { messageId: last.id } });
    };
    mark();
    document.addEventListener("visibilitychange", mark);
    return () => document.removeEventListener("visibilitychange", mark);
  }, [items, c.id, mySide]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: on descend en bas à chaque nouveau message (reçu ou en cours d'envoi).
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [items.length, pending.length]);

  const deliver = useCallback(
    async (p: Pending) => {
      const res = await apiFetch<MessageView>(`/conversations/${c.id}/messages`, {
        method: "POST",
        json: p.imageKey ? { clientId: p.clientId, imageKey: p.imageKey } : { clientId: p.clientId, body: p.body },
      });
      if (res.ok) {
        setItems((list) => (list.some((x) => x.id === res.data.id) ? list : [...list, { ...res.data, readBy: [] }]));
        setPending((list) => list.filter((x) => x.clientId !== p.clientId));
      } else if (res.status === 0 || res.status >= 500) {
        // Réseau coupé : nouvel essai tant que la page reste ouverte (même clientId, publié une seule fois).
        setPending((list) => list.map((x) => (x.clientId === p.clientId ? { ...x, failed: true } : x)));
      } else {
        setPending((list) =>
          list.map((x) => (x.clientId === p.clientId ? { ...x, failed: true, error: res.error.message } : x)),
        );
      }
    },
    [c.id],
  );

  useEffect(() => {
    const retry = pending.filter((p) => p.failed && !p.error);
    if (!retry.length) return;
    const timer = setTimeout(() => {
      for (const p of retry) void deliver(p);
    }, 3000);
    return () => clearTimeout(timer);
  }, [pending, deliver]);

  const queue = (p: Omit<Pending, "failed">) => {
    const item = { ...p, failed: false };
    setPending((list) => [...list, item]);
    void deliver(item);
  };

  const sendText = () => {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    queue({ clientId: crypto.randomUUID(), body });
  };

  const sendImage = async (file: File) => {
    setError(null);
    if (file.size > 15 * 1024 * 1024) {
      setError(messagingLabels.imageTooLarge);
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("purpose", "message");
      form.append("file", file);
      const res = await fetch("/api/me/uploads", { method: "POST", body: form, credentials: "same-origin" });
      const json = (await res.json().catch(() => null)) as UploadResult | { error?: { message?: string } } | null;
      if (!res.ok || !json || !("key" in json)) {
        setError((json as { error?: { message?: string } } | null)?.error?.message ?? "Envoi de la photo impossible.");
        return;
      }
      queue({ clientId: crypto.randomUUID(), imageKey: json.key });
    } catch {
      setError("Connexion impossible. Réessaie.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async (m: MessageView) => {
    if (!window.confirm(messagingLabels.deleteConfirm)) return;
    const res = await apiFetch(`/messages/${m.id}`, { method: "DELETE" });
    if (res.ok) {
      setItems((list) => list.map((x) => (x.id === m.id ? { ...x, deleted: true, body: null, image: null } : x)));
    } else setError(res.error.message);
  };

  const loadOlder = async () => {
    if (!older) return;
    const res = await apiFetch<MessagePage>(`/conversations/${c.id}/messages?before=${older}`);
    if (!res.ok) return setError(res.error.message);
    setItems((list) => [...chronological(res.data.items), ...list]);
    setOlder(res.data.nextCursor);
  };

  // « Lu par » : sous le dernier de mes messages lu par quelqu'un.
  const lastReadMine = [...items].reverse().find((m) => mySide(m) && m.readBy && m.readBy.length > 0);
  const blocked = c.writeBlocked ? messagingLabels.writeBlocked[c.writeBlocked] : null;
  const label = (m: MessageView) => {
    if (!m.asStructure) return m.sender?.pseudo ?? messagingLabels.deletedAccount;
    const structure = c.structure?.name ?? "";
    return messagingLabels.byPseudo(structure, m.sender?.pseudo ?? messagingLabels.deletedAccount);
  };

  return (
    <div className="s-narrow s-stack" data-testid="conversation">
      <FicheBar title={messagingLabels.inbox} back="/app/boite" />
      <header className="s-row s-row--top">
        <PersonAvatar url={c.avatarUrl} pseudo={c.title} size={48} />
        <div className="s-grow s-stack s-stack--tight">
          <h1 className="s-title">{c.title}</h1>
          {c.subtitle && <span className="o-t-caption s-muted">{c.subtitle}</span>}
          {c.otherUser && (
            <a className="o-t-caption" href={`/u/${encodeURIComponent(c.otherUser.pseudo)}`}>
              {messagingLabels.viewProfile}
            </a>
          )}
          {!c.otherUser && c.structure && (
            <a className="o-t-caption" href={`/o/${c.structure.slug}`}>
              {c.structure.name}
            </a>
          )}
        </div>
      </header>

      {older && (
        <Button variant="secondary" icon="back" onClick={loadOlder}>
          {messagingLabels.olderMessages}
        </Button>
      )}

      <ol className="s-chat" aria-live="polite" data-testid="messages">
        {items.map((m, i) => {
          const mine = mySide(m);
          const prev = items[i - 1];
          const day = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
          // Message d'information (« Léa a rejoint le crew. », lot 19) : centré, sans bulle ni expéditeur.
          if (m.kind === "system") {
            return (
              <li key={m.id} className="s-chat__item" data-testid="message-system">
                {day && <div className="s-chat__day o-t-caption s-muted">{formatDay(m.createdAt)}</div>}
                <p className="o-t-caption s-muted s-center">{systemMessageText(m.body)}</p>
              </li>
            );
          }
          return (
            <li key={m.id} className={`s-chat__item${mine ? " s-chat__item--mine" : ""}`} data-testid="message">
              {day && <div className="s-chat__day o-t-caption s-muted">{formatDay(m.createdAt)}</div>}
              {(!mine || (m.asStructure && c.side === "structure")) &&
                (prev?.sender?.userId !== m.sender?.userId || day) && (
                  <span className="o-t-caption s-muted">{label(m)}</span>
                )}
              <div className={`s-bubble${mine ? " s-bubble--mine" : ""}${m.deleted ? " s-bubble--deleted" : ""}`}>
                {m.deleted ? (
                  <em>{m.moderated ? moderationLabels.messageRemoved : messagingLabels.deleted}</em>
                ) : m.image ? (
                  <a href={m.image.url} target="_blank" rel="noopener" aria-label={messagingLabels.openImage}>
                    <img
                      src={m.image.url}
                      alt={messagingLabels.photo}
                      className="s-bubble__img"
                      width={m.image.width ?? undefined}
                      height={m.image.height ?? undefined}
                      loading="lazy"
                    />
                  </a>
                ) : (
                  <span className="s-prewrap">{m.body}</span>
                )}
              </div>
              <span className="s-chat__meta o-t-caption s-muted">
                {formatTime(m.createdAt)}
                {m.sender?.userId === me.userId && !m.deleted && (
                  <button type="button" className="s-linkbutton o-t-caption" onClick={() => void remove(m)}>
                    {messagingLabels.deleteMessage}
                  </button>
                )}
                {/* Signaler (lot 32) : les messages des autres ; la copie des messages voisins est faite par l'API. */}
                {m.sender && m.sender.userId !== me.userId && !m.deleted && (
                  <ReportDialog look="link" targetType="message" targetId={m.id} />
                )}
              </span>
              {lastReadMine?.id === m.id && (
                <span className="s-chat__read o-t-caption" data-testid="read-by">
                  {messagingLabels.readBy((m.readBy ?? []).map((r) => r.pseudo))}
                </span>
              )}
            </li>
          );
        })}
        {pending.map((p) => (
          <li key={p.clientId} className="s-chat__item s-chat__item--mine" data-testid="message-pending">
            <div className="s-bubble s-bubble--mine s-bubble--pending">
              <span className="s-prewrap">{p.body ?? messagingLabels.photo}</span>
            </div>
            <span className="s-chat__meta o-t-caption s-muted">
              {p.error ?? (p.failed ? messagingLabels.notSent : messagingLabels.sending)}
            </span>
          </li>
        ))}
      </ol>
      <div ref={endRef} />

      {error && (
        <p className="s-error" role="alert">
          {error}
        </p>
      )}
      {blocked ? (
        <p className="s-notice" data-testid="write-blocked">
          {blocked}
        </p>
      ) : (
        <form
          className="s-composer"
          onSubmit={(e) => {
            e.preventDefault();
            sendText();
          }}
        >
          <label className="o-visually-hidden" htmlFor="message-body">
            {messagingLabels.placeholder}
          </label>
          <textarea
            id="message-body"
            className="s-textarea s-composer__field"
            rows={2}
            maxLength={MESSAGE_BODY_MAX}
            placeholder={messagingLabels.placeholder}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendText();
              }
            }}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            // Ouvert par le bouton « Photo » (le champ natif de Chrome tronque son libellé).
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void sendImage(file);
            }}
            data-testid="message-file"
          />
          <div className="s-row">
            <Button variant="secondary" icon="add" onClick={() => fileRef.current?.click()} loading={uploading}>
              {messagingLabels.photo}
            </Button>
            <Button type="submit" variant="primary" icon="next" disabled={!draft.trim()}>
              {messagingLabels.send}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
