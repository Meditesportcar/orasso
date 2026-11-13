// Les réponses qui arrivent après un changement de casquette (R9n, tour 5), en logique pure : `useComments` et `PostMenu` les appellent
// avec le vrai `postLive`, les tests avec un vrai `createPostLiveSet`. Règles : R1 toute écriture va dans le magasin du ticket ;
// R2 tout état lu pour calculer une écriture est lu dans ce magasin (dans le rappel de `updateSheet`, ou `sheetOf(id, t)`) ;
// R3 tout effet visible n'a lieu que si `isCurrent(t)`.
import { type FeedPostView, postWithCommentRemoved, sheetRemoveComment } from "@orasso/shared";

import type { PostLiveSet, ScopedTicket } from "./storeSet";

/**
 * Une modification de la carte d'une publication (compteurs, aperçus, `commentsOff`) : **toujours** calculée depuis les données du magasin
 * du ticket et écrite dans ce magasin (même quand sa casquette est redevenue active et que l'écran d'origine est démonté, C2 de Codex) ;
 * le rappel de l'écran n'est appelé que pour la casquette active et une instance encore montée (`mounted`).
 */
export function emitPost(
  live: PostLiveSet,
  ticket: ScopedTicket,
  post: FeedPostView,
  change: (post: FeedPostView, ctx: { stale: boolean }) => FeedPostView,
  onCurrent: (next: FeedPostView) => void,
  mounted: () => boolean = () => true,
  refetch?: (postId: string) => Promise<FeedPostView | null>,
): void {
  if (!live.alive(ticket)) return;
  // La carte a été relue pendant la mutation : on ne devine pas (un compteur différent ne prouve pas que la relecture contient notre
  // mutation), on **relit la publication** après la confirmation (une requête) et elle devient la base de la carte (tour 7, point 1).
  const moved = live.cardMoved(post.id, ticket);
  const next = live.changePost(post.id, ticket, change);
  if (live.isCurrent(ticket) && mounted()) onCurrent(next ?? change(post, { stale: false }));
  if (moved && refetch) {
    void refetch(post.id)
      .then((fresh) => {
        if (!fresh || !live.alive(ticket)) return;
        live.refreshPost(post.id, ticket, fresh);
        if (live.isCurrent(ticket) && mounted()) onCurrent(fresh);
      })
      .catch(() => undefined);
  }
}

/** Retire un commentaire du fil du ticket (R2 : l'état est lu dans le rappel) et met à jour la carte (`emit`). */
export function dropRemoved(
  live: PostLiveSet,
  postId: string,
  commentId: string,
  ticket: ScopedTicket,
  emit: (change: (post: FeedPostView, ctx: { stale: boolean }) => FeedPostView) => void,
): void {
  let removedCount: number | null = null;
  const state = live.updateSheet(
    postId,
    (s) => {
      const r = sheetRemoveComment(s, commentId);
      removedCount = r.removed;
      return r.state;
    },
    ticket,
  );
  const removed = removedCount;
  if (removed !== null)
    emit((post, ctx) => (ctx.stale ? post : postWithCommentRemoved(post, commentId, removed, state)));
}

/**
 * Un parent disparu (404 d'un fil de réponses) : rend périmées les lectures du fil de réponses **dans le magasin du ticket**, retire le
 * parent s'il y est, et dit s'il faut relire la première page (seulement pour la casquette active).
 */
export function parentGone(
  live: PostLiveSet,
  postId: string,
  parentId: string,
  ticket: ScopedTicket,
  emit: (change: (post: FeedPostView, ctx: { stale: boolean }) => FeedPostView) => void,
): "reload" | "done" {
  live.dropReads(postId, `r:${parentId}`, ticket);
  if (!live.sheetOf(postId, ticket).items.some((c) => c.id === parentId)) return "done";
  dropRemoved(live, postId, parentId, ticket, emit);
  return live.isCurrent(ticket) ? "reload" : "done";
}

/**
 * « Couper les commentaires » réussi (menu « ⋯ » de la carte) : la casquette active reçoit la carte ; une autre, la modification dans son
 * magasin. Rend vrai si la réponse est celle de la casquette active (fermer le menu, afficher l'erreur : seulement alors).
 */
export function applyCommentsOff(
  live: PostLiveSet,
  target: FeedPostView,
  commentsOff: boolean,
  ticket: ScopedTicket,
): boolean {
  const current = live.isCurrent(ticket);
  if (current) live.apply(target); // la publication telle que l'API l'a rendue est retenue pour cette casquette
  const next = live.changePost(target.id, ticket, (post) => ({ ...post, commentsOff }));
  if (current && !next) live.set(target, { ...live.apply(target), commentsOff }, ticket);
  return current;
}
