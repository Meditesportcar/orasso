// La publication telle qu'on la montre : l'API, plus ce que l'écran a changé depuis (commentaire ajouté, commentaires coupés).
// Un seul magasin pour la ligne d'actions, les deux commentaires sous la carte et la feuille (lot R8k2).
import { createPostLiveStore, type FeedPostView } from "@orasso/shared";
import { useCallback, useMemo, useSyncExternalStore } from "react";

import { listenSession } from "../../lib/sessionChannel";

export const postLive = createPostLiveStore();

// Un autre compte (ou aucun), annoncé par `sessionChannel` : tout ce qui appartient au précédent s'en va (publications changées, fils,
// brouillons, envois en attente) et les réponses encore en route sont jetées. Chaque page annonce le compte courant : seul un compte
// **différent** du dernier annoncé compte (le magasin le sait : la première annonce ne fait que poser la référence).
const accountSubs = new Set<() => void>();
let announced: string | null | undefined;
if (typeof window !== "undefined") {
  listenSession((userId) => {
    const changed = announced !== undefined && announced !== userId;
    announced = userId;
    postLive.setAccount(userId);
    if (changed) for (const fn of [...accountSubs]) fn();
  });
}

/** Prévient quand le compte change (déconnexion, autre compte) ; rend l'arrêt. */
export function onAccountChange(fn: () => void): () => void {
  accountSubs.add(fn);
  return () => {
    accountSubs.delete(fn);
  };
}

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
