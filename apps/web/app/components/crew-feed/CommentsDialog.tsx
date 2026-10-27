// Commentaires d'une publication du fil, sur le site (lot R5c1) : une feuille (`<dialog>`), 300 caractères, Signaler,
// Retirer pour son auteur ou le chef. Mêmes règles que l'appli (toutes dans l'API).
import { Button } from "@orasso/design-system/web";
import {
  CREW_COMMENT_MAX,
  type CrewCommentView,
  type CrewPostView,
  crewFeedLabels,
  mergeCrewComments,
  type Page,
  readCrewComments,
} from "@orasso/shared";
import { useEffect, useId, useRef, useState } from "react";

import { apiFetch } from "../../lib/api.client";
import { PersonAvatar } from "../People";
import { ReportDialog } from "../ReportDialog";
import { useCrewLiveNeeds } from "./CrewLive";
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
  // Tour 2 : chaque réponse est rangée sous sa publication ; ouvrir une autre publication entre-temps ne mélange rien
  // et garde le brouillon de chacune. Fusion par identifiant, ordre chronologique.
  const [byPost, setByPost] = useState<Record<string, { items: CrewCommentView[]; cursor: string | null }>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const postId = post?.id ?? null;
  const items = postId ? (byPost[postId]?.items ?? null) : null;
  const cursor = postId ? (byPost[postId]?.cursor ?? null) : null;
  const text = postId ? (drafts[postId] ?? "") : "";
  // Seule la dernière lecture compte (changement de publication pendant une lecture).
  const seq = useRef(0);

  async function load(from?: string) {
    const target = postId;
    if (!target) return;
    const mine = from ? seq.current : ++seq.current;
    const res = await apiFetch<Page<CrewCommentView>>(
      `/crews/${crewId}/posts/${target}/comments${from ? `?cursor=${encodeURIComponent(from)}` : ""}`,
    );
    if (mine !== seq.current) return;
    if (!res.ok) {
      setLoadError(res.error.message);
      return;
    }
    setByPost((all) => ({
      ...all,
      [target]: {
        items: mergeCrewComments(from ? (all[target]?.items ?? []) : [], res.data.items),
        cursor: res.data.nextCursor,
      },
    }));
    setLoadError(null);
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: une nouvelle publication relit ses commentaires.
  useEffect(() => {
    setError(null);
    setLoadError(null);
    if (!postId) {
      if (ref.current?.open) ref.current.close();
      return;
    }
    if (!ref.current?.open) ref.current?.showModal();
    void load();
  }, [postId]);

  // Lot R6a : fenêtre ouverte, les commentaires des autres arrivent (et partent) sans la rouvrir.
  const byPostRef = useRef(byPost);
  byPostRef.current = byPost;
  useCrewLiveNeeds(async (needs) => {
    const target = postId;
    if (!target) return;
    if (needs.removedComments.length) {
      const gone = new Set(needs.removedComments);
      setByPost((all) =>
        Object.fromEntries(
          Object.entries(all).map(([id, v]) => [id, { ...v, items: v.items.filter((x) => !gone.has(x.id)) }]),
        ),
      );
    }
    if (!needs.comments.includes(target) && !needs.full) return;
    const shown = byPostRef.current[target];
    if (!shown) return; // Pas encore lue : sa première lecture suffit.
    const mine = seq.current;
    // Tour 2 : relue jusqu'à couvrir l'affiché (toute la liste si elle était complète : les nouveaux sont à la fin). Une
    // page en échec rejette tout : la liste et son curseur restent, la relecture est retentée. Au-delà de la limite de
    // pages, le vrai curseur est gardé (« Voir la suite »).
    const path = `/crews/${crewId}/posts/${target}/comments`;
    const next = await readCrewComments(async (from) => {
      const res = await apiFetch<Page<CrewCommentView>>(from ? `${path}?cursor=${encodeURIComponent(from)}` : path);
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    }, shown);
    if (mine !== seq.current) return;
    setByPost((all) => ({ ...all, [target]: next }));
  }, postId !== null);

  async function send() {
    const target = postId;
    if (!target) return;
    const body = (drafts[target] ?? "").trim();
    if (!body) {
      setError(crewFeedLabels.commentMissing);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await apiFetch<CrewCommentView>(`/crews/${crewId}/posts/${target}/comments`, {
      method: "POST",
      json: { text: body },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    // La réponse va à sa publication, même si une autre est ouverte entre-temps.
    setByPost((all) => ({
      ...all,
      [target]: { items: mergeCrewComments(all[target]?.items ?? [], [res.data]), cursor: all[target]?.cursor ?? null },
    }));
    setDrafts((all) => ({ ...all, [target]: "" }));
    onCount(target, 1);
  }

  async function remove(c: CrewCommentView) {
    const target = postId;
    if (!target || !window.confirm(crewFeedLabels.removeCommentConfirm)) return;
    setBusy(true);
    const res = await apiFetch(`/crews/${crewId}/comments/${c.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setError(res.error.message);
      return;
    }
    setByPost((all) => ({
      ...all,
      [target]: { items: (all[target]?.items ?? []).filter((x) => x.id !== c.id), cursor: all[target]?.cursor ?? null },
    }));
    onCount(target, -1);
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
          onChange={(e) => {
            const value = e.target.value;
            if (postId) setDrafts((all) => ({ ...all, [postId]: value }));
          }}
          data-testid="crew-comment-input"
        />
        <Button icon="send" disabled={busy} loading={busy} onClick={() => void send()} data-testid="crew-comment-send">
          {crewFeedLabels.commentSend}
        </Button>
      </div>
    </dialog>
  );
}
