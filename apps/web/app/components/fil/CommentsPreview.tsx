// Les deux derniers commentaires sous la carte d'une publication, puis « Voir les N commentaires » (lot R8k2, maquette R8.3 `cmPrev`,
// gabarit `.r8cmts`). Aucun commentaire : rien (pas d'invitation). Prend `post` et `onChange(post)` comme `PostActions`.
import { Icon } from "@orasso/design-system/web";
import { type FeedPostView, feedAgo, lastCommentsLine } from "@orasso/shared";

import { postLive, usePostLive } from "./commentsLive";
import "../../styles/fil-comments.css";

export function CommentsPreview({
  post: server,
  onChange,
}: {
  post: FeedPostView;
  onChange?: (post: FeedPostView) => void;
}) {
  const { post } = usePostLive(server, onChange);
  if (postLive.isGone(post.id) || (post.commentsCount <= 0 && post.lastComments.length === 0)) return null;
  const now = new Date();
  return (
    <div className="fil-cmts" data-testid="feed-post-last-comments">
      {post.lastComments.map((m) => (
        <p key={m.id} data-testid="feed-post-last-comment">
          <b>{m.author.pseudo}</b> {m.text}
          <small>{feedAgo(m.createdAt, now)}</small>
        </p>
      ))}
      <button
        type="button"
        className="fil-more"
        onClick={() => postLive.open(post.id, false)}
        data-testid="feed-post-comments-open"
      >
        {lastCommentsLine(post.commentsCount)}
        <Icon name="next" size={14} />
      </button>
    </div>
  );
}
