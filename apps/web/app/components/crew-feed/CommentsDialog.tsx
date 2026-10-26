// Commentaires d'une publication du fil, sur le site (lot R5c1) : une feuille (`<dialog>`), 300 caractères, Signaler,
// Retirer pour son auteur ou le chef. Mêmes règles que l'appli (toutes dans l'API).
import { Button } from "@orasso/design-system/web";
import { CREW_COMMENT_MAX, type CrewCommentView, type CrewPostView, crewFeedLabels, type Page } from "@orasso/shared";
import { useEffect, useId, useRef, useState } from "react";

import { apiFetch } from "../../lib/api.client";
import { PersonAvatar } from "../People";
import { ReportDialog } from "../ReportDialog";
import { whenOf } from "./PostCard";

export function CommentsDialog({
  crewId,
  post,
  onClose,
  onCount,
}: {
  crewId: string;
  post: CrewPostView | null;
  onClose: () => void;
  onCount: (postId: string, delta: number) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [items, setItems] = useState<CrewCommentView[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const postId = post?.id ?? null;
  // Seule la dernière lecture compte (changement de publication pendant une lecture).
  const seq = useRef(0);

  async function load(from?: string) {
    if (!postId) return;
    const mine = from ? seq.current : ++seq.current;
    const res = await apiFetch<Page<CrewCommentView>>(
      `/crews/${crewId}/posts/${postId}/comments${from ? `?cursor=${encodeURIComponent(from)}` : ""}`,
    );
    if (mine !== seq.current) return;
    if (!res.ok) {
      setLoadError(res.error.message);
      return;
    }
    setItems((current) => (from ? [...(current ?? []), ...res.data.items] : res.data.items));
    setCursor(res.data.nextCursor);
    setLoadError(null);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: une nouvelle publication relit ses commentaires.
  useEffect(() => {
    setItems(null);
    setCursor(null);
    setError(null);
    setLoadError(null);
    setText("");
    if (!postId) {
      if (ref.current?.open) ref.current.close();
      return;
    }
    if (!ref.current?.open) ref.current?.showModal();
    void load();
  }, [postId]);

  async function send() {
    if (!postId) return;
    if (!text.trim()) {
      setError(crewFeedLabels.commentMissing);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await apiFetch<CrewCommentView>(`/crews/${crewId}/posts/${postId}/comments`, {
      method: "POST",
      json: { text: text.trim() },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setItems((current) => [...(current ?? []), res.data]);
    setText("");
    onCount(postId, 1);
  }

  async function remove(c: CrewCommentView) {
    if (!postId || !window.confirm(crewFeedLabels.removeCommentConfirm)) return;
    setBusy(true);
    const res = await apiFetch(`/crews/${crewId}/comments/${c.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setItems((current) => (current ?? []).filter((x) => x.id !== c.id));
    onCount(postId, -1);
  }

  return (
    <dialog
      ref={ref}
      className="cf-sheet"
      aria-labelledby={titleId}
      onClose={onClose}
      data-testid="crew-comments-sheet"
    >
      <div className="cf-sheet__body">
        <div className="cf-sheet__head">
          <h2 id={titleId} className="s-h2">
            {crewFeedLabels.comments}
          </h2>
          <Button variant="close" label="Fermer" onClick={() => ref.current?.close()} />
        </div>
        {loadError ? (
          <div className="s-stack">
            <p className="s-error" role="alert">
              {loadError}
            </p>
            <Button variant="secondary" icon="undo" onClick={() => void load()}>
              {crewFeedLabels.retry}
            </Button>
          </div>
        ) : items === null ? (
          <p className="s-muted">…</p>
        ) : items.length === 0 ? (
          <p className="s-muted">{crewFeedLabels.noComments}</p>
        ) : (
          <ul className="cf-comments" data-testid="crew-comments">
            {items.map((c) => (
              <li key={c.id} className="cf-comment" data-testid="crew-comment">
                <PersonAvatar url={c.author?.avatarUrl ?? null} pseudo={c.author?.pseudo ?? "?"} size={32} />
                <div>
                  <span className="o-t-caption s-muted">
                    <strong>{c.author?.pseudo ?? crewFeedLabels.deletedAccount}</strong> · {whenOf(c.createdAt)}
                  </span>
                  <p>{c.text}</p>
                  <div className="cf-comment__acts">
                    {!c.mine && <ReportDialog look="link" targetType="crew_comment" targetId={c.id} />}
                    {c.canRemove && (
                      <button
                        type="button"
                        className="cf-link"
                        disabled={busy}
                        onClick={() => void remove(c)}
                        data-testid="crew-comment-remove"
                      >
                        {crewFeedLabels.remove}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {cursor && (
          <Button variant="secondary" icon="down" onClick={() => void load(cursor)}>
            {crewFeedLabels.loadMore}
          </Button>
        )}
        {error && (
          <p className="s-error" role="alert">
            {error}
          </p>
        )}
        <label className="s-label o-t-label" htmlFor={`${titleId}-text`}>
          {crewFeedLabels.commentPlaceholder}
        </label>
        <textarea
          id={`${titleId}-text`}
          className="s-textarea"
          rows={2}
          maxLength={CREW_COMMENT_MAX}
          value={text}
          onChange={(e) => setText(e.target.value)}
          data-testid="crew-comment-input"
        />
        <Button icon="send" disabled={busy} loading={busy} onClick={() => void send()} data-testid="crew-comment-send">
          {crewFeedLabels.commentSend}
        </Button>
      </div>
    </dialog>
  );
}
