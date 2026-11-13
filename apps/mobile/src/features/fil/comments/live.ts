// La publication telle qu'on la montre : l'API, plus ce que l'écran a changé depuis (commentaire ajouté, commentaires coupés).
// Un seul magasin pour la ligne d'actions, les deux commentaires sous la carte et la feuille (lot R8k2).
import type { FeedPostView } from "@orasso/shared";
import { useCallback, useMemo, useSyncExternalStore } from "react";

import { cacheScope } from "@/lib/kv";
import { useActor } from "@/lib/useActor";
import { commentsScope } from "./scope";
import { createPostLiveSet } from "./storeSet";

/** Un magasin par compte et par casquette, conservés au changement de casquette (R9n, tour 2, point 8). */
export const postLive = createPostLiveSet();

export function usePostLive(server: FeedPostView, onChange?: (post: FeedPostView) => void) {
  // Lot R9n (tour 1) : le magasin est rangé par compte et par casquette.
  const actor = useActor();
  const version = useSyncExternalStore(postLive.subscribe, postLive.version, postLive.version);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` relit le magasin.
  const post = useMemo(() => {
    // Un autre compte (ou aucun) : tout ce qui appartient au précédent s'en va (la déconnexion le fait aussi).
    postLive.setAccount(commentsScope(cacheScope(), actor), true);
    return postLive.apply(server);
  }, [server, version, actor]);
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
