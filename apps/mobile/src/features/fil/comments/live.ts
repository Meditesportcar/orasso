// La publication telle qu'on la montre : l'API, plus ce que l'écran a changé depuis (commentaire ajouté, commentaires coupés).
// Un seul magasin pour la ligne d'actions, les deux commentaires sous la carte et la feuille (lot R8k2).
import { createPostLiveStore, type FeedPostView } from "@orasso/shared";
import { useCallback, useMemo, useSyncExternalStore } from "react";

export const postLive = createPostLiveStore();

export function usePostLive(server: FeedPostView, onChange?: (post: FeedPostView) => void) {
  const version = useSyncExternalStore(postLive.subscribe, postLive.version, postLive.version);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` relit le magasin.
  const post = useMemo(() => postLive.apply(server), [server, version]);
  const opening = useSyncExternalStore(postLive.subscribe, postLive.opening, postLive.opening);
  const change = useCallback(
    (next: FeedPostView) => {
      postLive.set(server, next);
      onChange?.(next);
    },
    [server, onChange],
  );
  return { post, change, opening: opening?.postId === server.id ? opening : null };
}
