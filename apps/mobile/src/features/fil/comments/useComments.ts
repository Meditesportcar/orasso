// La feuille des commentaires d'une publication (lot R8k2) : lecture par pages, réponses, envoi (la ligne apparaît tout de
// suite, grisée), flamme, suppression, « Couper les commentaires ». Aucune règle de fond : l'API les tient (lot R8k1) ; les
// états et les compteurs sont dans `rules/feedCommentsList.ts` (pur, testé). Tour 3 : le fil, le brouillon et les envois en attente
// vivent dans le magasin (`postLive`), par compte et par publication, hors du montage des cartes ; chaque réponse de l'API porte un
// ticket (compte + génération) et est jetée si le compte a changé.
import {
  type CommentDraft,
  createFlameGate,
  type FeedCommentView,
  type FeedPostView,
  feedCommentScreenLabels as L,
  type LiveTicket,
  type MentionDraft,
  type MentionSuggestion,
  pendingDrop,
  pendingFail,
  pendingRetry,
  pendingStart,
  postWithCommentAdded,
  postWithCommentRemoved,
  repliesMark,
  type SheetState,
  sheetAddComment,
  sheetApplyParentCount,
  sheetFind,
  sheetMark,
  sheetRemoveComment,
  sheetReopen,
  sheetSetReaction,
  sheetToggleReplies,
  sheetWithRepliesPage,
  sheetWithTopPage,
} from "@orasso/shared";
import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { confirmRemove } from "@/features/crews/feed/confirm";
import { api } from "@/lib/api";
import { ApiRequestError, errorMessage } from "@/lib/http";
import { cacheScope } from "@/lib/kv";
import { useActor } from "@/lib/useActor";
import { postLive } from "./live";
import { replyParentOf } from "./replyParent";
import { forgetSender, rememberSender, senderOf } from "./sendActors";

const statusOf = (e: unknown) => (e instanceof ApiRequestError ? e.status : -1);

/** Les flammes de tous les commentaires : une mutation à la fois par commentaire. */
const flames = createFlameGate();

export type CommentsController = {
  sheet: SheetState;
  draft: CommentDraft;
  setDraft: (patch: Partial<CommentDraft>) => void;
  loadError: string | null;
  /** La publication n'est plus lisible (404) : ses commentaires sont vidés et la feuille se ferme. */
  gone: boolean;
  actionError: string | null;
  loadMore: () => void;
  retryLoad: () => void;
  toggleReplies: (parentId: string) => void;
  loadMoreReplies: (parentId: string) => void;
  send: (text: string, parentId: string | null) => void;
  retry: (clientId: string) => void;
  discard: (clientId: string) => void;
  remove: (comment: FeedCommentView) => Promise<void>;
  fire: (comment: FeedCommentView) => void;
  setOff: (off: boolean) => Promise<void>;
};

/** R3 : seule la casquette active a des effets visibles (message, relance, carte). */
const isCurrent = (t: LiveTicket): boolean => postLive.isCurrent(t as never);

export function useComments(
  post: FeedPostView,
  active: boolean,
  onPost: (next: FeedPostView) => void,
): CommentsController {
  const version = useSyncExternalStore(postLive.subscribe, postLive.version, postLive.version);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` relit le magasin.
  const sheet = useMemo(() => postLive.sheetOf(post.id), [post.id, version]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `version` relit le magasin.
  const draft = useMemo(() => postLive.draftOf(post.id), [post.id, version]);
  const gone = postLive.isGone(post.id);
  const postRef = useRef(post);
  postRef.current = post;
  const onPostRef = useRef(onPost);
  onPostRef.current = onPost;
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const mounted = useRef(true);
  // Lot R9n (T7) : lire et commenter au nom de la casquette active (en-tête de la liste blanche).
  const actor = useActor();
  const actorRef = useRef(actor);
  actorRef.current = actor;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const id = post.id;
  /** R1 : toute écriture va dans le magasin du ticket. */
  const update = useCallback(
    (fn: (s: SheetState) => SheetState, ticket: LiveTicket) => postLive.updateSheet(id, fn, ticket),
    [id],
  );
  /** Une réponse de l'API d'un autre compte n'écrit ni la feuille ni la carte. */
  const emitPost = useCallback((change: (post: FeedPostView) => FeedPostView, ticket: LiveTicket) => {
    if (!postLive.alive(ticket)) return;
    // R1/R3 : la carte affichée est celle de la casquette active ; pour une autre, la modification est calculée depuis ses données et
    // écrite dans son magasin (elle la retrouve à son retour), sans toucher à la carte affichée (C3).
    if (isCurrent(ticket)) onPostRef.current(change(postRef.current));
    else postLive.changePost(postRef.current.id, ticket as never, change);
  }, []);
  /**
   * 404 d'une **route de la publication** (première page, couper, envoi sans `parentId`) : la publication n'est plus lisible, tout ce qu'on
   * en gardait s'en va et la feuille se ferme. Le 404 d'une route de commentaire (réponses, suppression, envoi d'une réponse) ne dit que
   * « commentaire introuvable » : il ne retire jamais la publication, la publication est revalidée par une relecture (`loadTop`).
   */
  const postGone = useCallback(
    (e: unknown, ticket: LiveTicket) => {
      if (statusOf(e) !== 404) return false;
      postLive.markGone(id, ticket);
      return true;
    },
    [id],
  );

  const loadReplies = useCallback(
    async (parentId: string, from?: string | null) => {
      const t = from ? postLive.followRead(id, `r:${parentId}`) : postLive.beginRead(id, `r:${parentId}`);
      const since = repliesMark(postLive.sheetOf(id, t as never), parentId);
      try {
        const page = await api.feedCommentReplies(parentId, from);
        // Une lecture plus récente de ce fil de réponses (même d'une autre instance) a pris la main : celle-ci est jetée.
        if (!postLive.fresh(t)) return;
        update((s) => sheetWithRepliesPage(s, parentId, page.items, page.nextCursor, !from, since), t);
      } catch (e) {
        if (!postLive.fresh(t)) return;
        // Parent introuvable (supprimé) : on retire le parent et son état de réponses (ses lectures en cours sont invalidées), les envois en
        // attente restent, et la publication se revalide une seule fois.
        if (statusOf(e) === 404) {
          parentGoneRef.current?.(parentId, t);
          return;
        }
        if (mounted.current && isCurrent(t)) setActionError(errorMessage(e));
      }
    },
    [update, id],
  );
  const loadTopRef = useRef<(() => Promise<void>) | null>(null);
  const parentGoneRef = useRef<((parentId: string, t: LiveTicket) => void) | null>(null);

  const loadTop = useCallback(
    async (from?: string | null) => {
      const t = from ? postLive.followRead(id, "top") : postLive.beginRead(id, "top");
      // La marque se prend au départ de **chaque** lecture, pagination comprise.
      const since = sheetMark(postLive.sheetOf(id, t as never));
      try {
        const page = await api.feedComments(id, from, actorRef.current);
        if (!postLive.fresh(t)) return;
        // Une lecture réussie rend la publication lisible (rouvrir ne suffit pas).
        postLive.clearGone(t);
        const next = update((s) => sheetWithTopPage(s, page.items, page.nextCursor, !from, since), t);
        if (mounted.current && isCurrent(t)) setLoadError(null);
        // Les réponses restées dépliées se revalident (elles ont pu être supprimées ou devenir privées entre deux ouvertures).
        // R3 : la relance des réponses ne part que pour la casquette active.
        if (!from && isCurrent(t)) {
          for (const [pid, r] of Object.entries(next.replies)) if (r.open && !r.loaded) void loadReplies(pid);
        }
      } catch (e) {
        if (!postLive.fresh(t) || postGone(e, t)) return;
        if (mounted.current && isCurrent(t)) setLoadError(errorMessage(e));
      }
    },
    [id, update, postGone, loadReplies],
  );
  loadTopRef.current = () => loadTop();

  // La feuille s'ouvre : les réponses se revalident, la première page est relue (sans effacer ce qui est affiché en attendant).
  // biome-ignore lint/correctness/useExhaustiveDependencies: seule l'ouverture (ou une autre publication) relit.
  useEffect(() => {
    if (!active) return;
    setActionError(null);
    update(sheetReopen, postLive.ticket(id));
    void loadTop();
  }, [active, id]);

  const toggleReplies = useCallback(
    (parentId: string) => {
      const t = postLive.ticket(id);
      const was = postLive.sheetOf(id).replies[parentId];
      const next = update((s) => sheetToggleReplies(s, parentId), t);
      if (!was?.loaded && next.replies[parentId]?.open) void loadReplies(parentId);
    },
    [id, update, loadReplies],
  );

  const submit = useCallback(
    async (clientId: string) => {
      const t = postLive.ticket(id);
      const p = postLive.sheetOf(id).pending.find((x) => x.clientId === clientId);
      if (!p) return;
      try {
        const created = await api.createFeedComment(
          id,
          { text: p.text.trim(), parentId: p.parentId, clientId },
          senderOf(clientId, actorRef.current),
        );
        forgetSender(clientId);
        if (!postLive.alive(t)) return;
        let counted = 1;
        const next = update((s) => {
          const r = sheetAddComment(pendingDrop(s, clientId), created, p.parentId, created.parent);
          counted = r.counted;
          return r.state;
        }, t);
        emitPost((post) => postWithCommentAdded(post, created, p.parentId, counted), t);
        if (p.parentId && !next.replies[p.parentId]?.loaded && isCurrent(t)) void loadReplies(p.parentId);
      } catch (e) {
        if (!postLive.alive(t)) return;
        const status = statusOf(e);
        if (status === 404) {
          // Sans `parentId`, la seule route en cause est la publication ; avec, c'est le commentaire visé : message bref, le texte reste (envoi en
          // échec gardé, les autres envois en attente aussi), la publication se revalide.
          if (!p.parentId) {
            postGone(e, t);
            return;
          }
          update((s) => pendingFail(s, clientId, L.commentGone), t);
          if (isCurrent(t)) void loadTop();
          return;
        }
        if (status === 409 && e instanceof ApiRequestError && e.code === "comments_off") {
          emitPost((post) => ({ ...post, commentsOff: true }), t);
        }
        update((s) => pendingFail(s, clientId, status === 0 ? L.notSent : errorMessage(e)), t);
      }
    },
    [id, update, emitPost, loadReplies, loadTop, postGone],
  );

  const send = useCallback(
    (text: string, parentId: string | null) => {
      const clientId = randomUUID();
      rememberSender(clientId, actorRef.current);
      update(
        (s) =>
          pendingStart(parentId ? sheetToggleReplies(s, parentId, true) : s, { clientId, text: text.trim(), parentId }),
        postLive.ticket(id),
      );
      void submit(clientId);
    },
    [update, submit, id],
  );

  const retry = useCallback(
    (clientId: string) => {
      update((s) => pendingRetry(s, clientId), postLive.ticket(id));
      void submit(clientId);
    },
    [update, submit, id],
  );

  const discard = useCallback(
    (clientId: string) => {
      forgetSender(clientId);
      update((s) => pendingDrop(s, clientId), postLive.ticket(id));
    },
    [update, id],
  );

  const dropRemoved = useCallback(
    (commentId: string, t: LiveTicket) => {
      // R2 : l'état à retirer est celui du magasin du ticket, lu dans le rappel (jamais celui de la casquette active).
      let removedIds: ReturnType<typeof sheetRemoveComment>["removed"] | null = null;
      const state = update((s) => {
        const r = sheetRemoveComment(s, commentId);
        removedIds = r.removed;
        return r.state;
      }, t);
      const removed = removedIds;
      if (removed) emitPost((post) => postWithCommentRemoved(post, commentId, removed, state), t);
    },
    [update, emitPost],
  );

  parentGoneRef.current = (parentId: string, t: LiveTicket) => {
    // R1 : les lectures du fil de réponses sont rendues périmées dans le magasin du ticket ; R2 : le parent se cherche dans ce magasin.
    postLive.dropReads(id, `r:${parentId}`, t as never);
    if (!postLive.sheetOf(id, t as never).items.some((c) => c.id === parentId)) return;
    dropRemoved(parentId, t);
    if (isCurrent(t)) void loadTop();
  };

  const remove = useCallback(
    async (comment: FeedCommentView) => {
      const hasReplies = comment.repliesCount > 0 && postLive.sheetOf(id).items.some((c) => c.id === comment.id);
      if (!(await confirmRemove(hasReplies ? L.deleteConfirm : L.deleteReplyConfirm))) return;
      const t = postLive.ticket(id);
      setActionError(null);
      // Le parent d'une réponse se retrouve avant son retrait de la feuille.
      const replyParent = replyParentOf(postLive.sheetOf(id), comment.id);
      try {
        const done = await api.removeFeedComment(comment.id);
        if (postLive.alive(t)) {
          dropRemoved(comment.id, t);
          // Le compteur du parent est celui du serveur, lu après la suppression (jamais un décrément local).
          update((s) => sheetApplyParentCount(s, done?.parent), t);
          // 204 sans `parent` (parent devenu illisible, déjà supprimé) : rien ne met son compteur à jour. La première page est relue
          // d'abord (le compteur du parent est celui du serveur), puis sa discussion, si le parent y est encore (un 404 le retire
          // comme `parentGoneRef`, qui relit lui-même la première page : jamais deux fois, ni avec l'ancien compteur).
          if (replyParent && !done?.parent && isCurrent(t)) {
            void loadTop().then(() => {
              if (isCurrent(t) && postLive.sheetOf(id, t as never).items.some((c) => c.id === replyParent))
                void loadReplies(replyParent);
            });
          }
        }
      } catch (e) {
        if (!postLive.alive(t)) return;
        // Déjà retiré (404 d'un commentaire) : seule la ligne part de l'écran ; la publication se revalide.
        if (statusOf(e) === 404) {
          dropRemoved(comment.id, t);
          if (isCurrent(t)) void loadTop();
        } else if (mounted.current && isCurrent(t)) setActionError(errorMessage(e));
      }
    },
    [
      id,
      dropRemoved,
      loadReplies,
      loadTop, // Le compteur du parent est celui du serveur, lu après la suppression (jamais un décrément local).
      update,
    ],
  );

  const fire = useCallback(
    (comment: FeedCommentView) => {
      const t = postLive.ticket(id);
      const current = sheetFind(postLive.sheetOf(id), comment.id) ?? comment;
      void flames.fire(
        `${t.g}|${t.p}|${(t as { s?: string | null }).s ?? ""}|${(t as { i?: number }).i ?? 0}|${id}|${comment.id}`,
        { reactionsCount: current.reactionsCount, reactedByMe: current.reactedByMe },
        {
          send: (on) => api.fireFeedComment(comment.id, on),
          apply: (state) => {
            update((s) => sheetSetReaction(s, comment.id, state), t);
          },
          alive: () => postLive.alive(t),
        },
      );
    },
    [id, update],
  );

  const setOff = useCallback(
    async (off: boolean) => {
      const t = postLive.ticket(id);
      setActionError(null);
      try {
        const res = await api.setFeedCommentsOff(id, off);
        emitPost((post) => ({ ...post, commentsOff: res.commentsOff }), t);
      } catch (e) {
        if (!postLive.alive(t) || postGone(e, t)) return;
        if (mounted.current && isCurrent(t)) setActionError(errorMessage(e));
      }
    },
    [id, emitPost, postGone],
  );

  return {
    sheet,
    draft,
    setDraft: (patch) => postLive.setDraft(id, patch),
    loadError,
    gone,
    actionError,
    loadMore: () => {
      const cursor = postLive.sheetOf(id).cursor;
      if (cursor) void loadTop(cursor);
    },
    retryLoad: () => void loadTop(),
    toggleReplies,
    loadMoreReplies: (parentId) => {
      const cursor = postLive.sheetOf(id).replies[parentId]?.cursor;
      if (cursor) void loadReplies(parentId, cursor);
    },
    send,
    retry,
    discard,
    remove,
    fire,
    setOff,
  };
}

/** Les personnes proposées après « @ » : relues 250 ms après la dernière frappe (jamais une rafale de requêtes). */
export function useMentionSuggestions(postId: string, draft: MentionDraft | null): MentionSuggestion[] {
  const [items, setItems] = useState<MentionSuggestion[]>([]);
  const query = draft ? draft.query : null;
  const scope = cacheScope();
  // Un autre compte : la liste du précédent s'en va.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `scope` seul déclenche.
  useEffect(() => setItems([]), [scope]);
  useEffect(() => {
    if (query === null) {
      setItems([]);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      api
        .feedMentionSuggestions(postId, query)
        .then((list) => {
          if (alive) setItems(list);
        })
        .catch(() => {
          if (alive) setItems([]);
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [postId, query]);
  return query === null ? [] : items;
}
