// Le menu « ⋯ » d'une publication posée dans une liste de profil ou ouverte seule : « Supprimer » (confirmé) pour qui peut la
// retirer, « Signaler » pour une publication d'un autre. Les droits viennent de l'API (`manage.canDelete` sur la page seule ;
// dans une liste, ma propre publication) ; chaque écriture revérifie les siens côté serveur.
import { Button, Icon } from "@orasso/design-system/web";
import { feedScreenLabels as F, type FeedPostView, publicationsLabels as L } from "@orasso/shared";
import { useEffect, useRef, useState } from "react";

import "../../styles/fil.css";
import "../../styles/moderation.css";
import { apiFetch } from "../../lib/api.client";
import { postLive } from "../fil/commentsLive";
import { forgetPublished } from "../fil/mine";
import { ReportDialog } from "../ReportDialog";
import { notifyPostRemoved } from "./signal";

export function PostMenu({
  post,
  canDelete,
  canCommentsOff = false,
  onClose,
  onRemoved,
}: {
  /** La publication dont le menu est ouvert ; `null` : fermé. */
  post: FeedPostView | null;
  canDelete: boolean;
  /** `manage.canCommentsOff` : « Couper les commentaires » / « Rétablir les commentaires ». */
  canCommentsOff?: boolean;
  onClose: () => void;
  /** Supprimée : la liste la retire (le signal) ; la page seule revient en arrière. */
  onRemoved?: (post: FeedPostView) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (post && !dialog.open) dialog.showModal();
    if (!post && dialog.open) dialog.close();
  }, [post]);

  async function toggleComments(target: FeedPostView) {
    setError(null);
    const off = !postLive.apply(target).commentsOff;
    const res = await apiFetch<{ commentsOff: boolean }>(`/me/feed-posts/${target.id}/comments-off`, {
      method: "PUT",
      json: { off },
    });
    if (!res.ok) return setError(res.error.message);
    postLive.set(target, { ...postLive.apply(target), commentsOff: res.data.commentsOff });
    onClose();
  }

  async function remove(target: FeedPostView) {
    setError(null);
    if (!window.confirm(F.removeConfirm)) return;
    const res = await apiFetch(`/me/feed-posts/${target.id}`, { method: "DELETE" });
    if (!res.ok) return setError(res.error.message);
    // La copie gardée dans l'onglet part aussi : le Fil ne remet pas en tête une publication qui n'existe plus.
    forgetPublished(target.id);
    notifyPostRemoved(target.id);
    onClose();
    onRemoved?.(target);
  }

  return (
    <dialog
      ref={ref}
      className="mod-dialog"
      aria-label={L.menuOpen}
      onClose={() => {
        setError(null);
        onClose();
      }}
      data-testid="publication-menu"
    >
      {post ? (
        <div className="s-stack">
          <h2 className="s-h2">{L.pageTitle}</h2>
          {error ? (
            <p className="o-t-caption" role="alert" data-testid="publication-menu-error">
              {error}
            </p>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              className="fil-menu__row"
              onClick={() => void remove(post)}
              data-testid="publication-menu-remove"
            >
              <Icon name="trash" size={20} />
              <span>
                <strong>{L.menuRemove}</strong>
              </span>
            </button>
          ) : null}
          {canCommentsOff ? (
            <button
              type="button"
              className="fil-menu__row"
              onClick={() => void toggleComments(post)}
              data-testid="publication-menu-comments"
            >
              <Icon name={postLive.apply(post).commentsOff ? "undo" : "close"} size={20} />
              <span>
                <strong>{postLive.apply(post).commentsOff ? L.menuCommentsOn : L.menuCommentsOff}</strong>
              </span>
            </button>
          ) : null}
          {post.mine ? null : (
            <div className="fil-menu__report" data-testid="publication-menu-report">
              <ReportDialog targetType="feed_post" targetId={post.id} label={F.report} look="link" />
            </div>
          )}
          <Button variant="plate" icon="close" fullWidth onClick={onClose} data-testid="publication-menu-close">
            Fermer
          </Button>
        </div>
      ) : null}
    </dialog>
  );
}
