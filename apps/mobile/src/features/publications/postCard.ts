// Une publication dans la carte du Fil (`FeedPostCard`), réutilisée telle quelle par les listes de profil et la page d'une
// publication seule : la raison du Fil (« Autour de toi ») n'a pas de sens ici, la petite ligne dit où elle se trouve.
import { type FeedCard, type FeedPostView, publicationsLabels as L } from "@orasso/shared";

export function postCard(post: FeedPostView): FeedCard<"feed_post"> {
  return {
    id: `feed_post:${post.id}`,
    kind: "feed_post",
    reason: { code: "following_author", label: post.mine ? L.cardReasonMine : L.cardReasonOther },
    at: post.createdAt,
    payload: { post },
  };
}
