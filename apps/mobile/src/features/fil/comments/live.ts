// La publication telle qu'on la montre : l'API, plus ce que l'écran a changé depuis (commentaire ajouté, commentaires coupés).
// Un seul magasin pour la ligne d'actions, les deux commentaires sous la carte et la feuille (lot R8k2).
import { createPostLiveStore, type FeedPostView } from "@orasso/shared";
import { useCallback, useMemo, useSyncExternalStore } from "react";

import { cacheScope } from "@/lib/kv";

export const postLive = createPostLiveStore();

// Un autre compte (ou aucun) : rien de ce que le précédent avait changé ne reste (la déconnexion appelle aussi `postLive.clear()`).
let liveScope = cacheScope();
function syncScope() {
  const scope = cacheScope();
  if (scope === liveScope) return;
  liveScope = scope;
  postLive.clear(true);
}

export function usePostLive(server: FeedPostView, onChange?: (post: FeedPostView) => void) {
  const version = useSyncExternalStore(postLive.subscribe, postLive.version, postLive.version);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` relit le magasin.
  const post = useMemo(() => {
    syncScope();
    return postLive.apply(server);
  }, [server, version]);
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
