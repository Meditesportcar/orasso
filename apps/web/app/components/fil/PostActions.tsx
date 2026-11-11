// La ligne d'actions d'une publication sur le site (lot R8k2, maquette R8.3 `actB`) : flamme (avec son nombre) · commentaire (avec
// son nombre) · partager (icône seule). Elle prend `post` et `onChange(post)` et ne suppose pas le Fil : le profil, la fiche d'un
// événement et les pages la posent telle quelle. La feuille des commentaires est montée ici, à la première ouverture.
import { Icon } from "@orasso/design-system/web";
import { feedCommentScreenLabels as C, type FeedPostView, feedScreenLabels as L, shareLabels } from "@orasso/shared";
import { useEffect, useRef, useState } from "react";

import { apiFetch } from "../../lib/api.client";
import { ShareBody } from "../ShareSheet";
import { CommentsDialog } from "./CommentsDialog";
import { postLive, usePostLive } from "./commentsLive";
import "../../styles/fil-comments.css";

export function PostActions({
  post: server,
  onChange,
}: {
  post: FeedPostView;
  onChange?: (post: FeedPostView) => void;
}) {
  const { post, change, opening } = usePostLive(server, onChange);
  const [fire, setFire] = useState({ count: post.reactionsCount, on: post.reactedByMe });
  const [busy, setBusy] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const shareRef = useRef<HTMLDialogElement>(null);
  useEffect(
    () => setFire({ count: post.reactionsCount, on: post.reactedByMe }),
    [post.reactionsCount, post.reactedByMe],
  );
  useEffect(() => {
    if (opening) setEverOpened(true);
  }, [opening]);
  useEffect(() => {
    if (sharing) shareRef.current?.showModal();
    else shareRef.current?.close();
  }, [sharing]);

  async function toggle() {
    if (busy) return;
    const before = fire;
    const on = !before.on;
    setBusy(true);
    setFire({ count: Math.max(0, before.count + (on ? 1 : -1)), on });
    const res = await apiFetch<{ reactionsCount: number; reactedByMe: boolean }>(`/feed-posts/${post.id}/reaction`, {
      method: on ? "PUT" : "DELETE",
    });
    setFire(res.ok ? { count: res.data.reactionsCount, on: res.data.reactedByMe } : before);
    setBusy(false);
  }

  return (
    <div className="fil-acts">
      <button
        type="button"
        className={fire.on ? "fil-fire is-on" : "fil-fire"}
        aria-pressed={fire.on}
        aria-label={L.fireLabel(fire.count, fire.on)}
        disabled={busy}
        onClick={() => void toggle()}
        data-testid="feed-post-fire"
      >
        <Icon name="fire" size={17} />
        <span data-testid="feed-post-fire-count">{fire.count}</span>
      </button>
      <button
        type="button"
        className="fil-fire"
        aria-label={C.comment}
        onClick={() => postLive.open(post.id, true)}
        data-testid="feed-post-comment"
      >
        <Icon name="chat" size={17} />
        <span data-testid="feed-post-comment-count">{post.commentsCount}</span>
      </button>
      <button
        type="button"
        className="fil-fire"
        aria-label={shareLabels.title}
        onClick={() => setSharing(true)}
        data-testid="feed-post-share"
      >
        <Icon name="share" size={17} />
      </button>
      <dialog
        ref={shareRef}
        className="mod-dialog share-dialog"
        aria-label={shareLabels.title}
        onClose={() => setSharing(false)}
        data-testid="share-dialog"
      >
        {sharing ? <ShareBody target={{ type: "feed_post", id: post.id }} onClose={() => setSharing(false)} /> : null}
      </dialog>
      {everOpened ? (
        <CommentsDialog
          post={post}
          open={opening !== null}
          focus={opening?.focus ?? false}
          onClose={() => postLive.close()}
          onChange={change}
        />
      ) : null}
    </div>
  );
}
