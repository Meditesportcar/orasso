// La feuille des commentaires d'une publication, sur le site (lot R8k2) : lecture par pages, réponses, envoi (la ligne apparaît
// tout de suite, grisée), flamme, suppression, « Couper les commentaires ». Même logique que l'appli ; les règles de fond sont dans
// l'API (lot R8k1) et les états dans `rules/feedCommentsList.ts` (pur, testé). Tour 3 : le fil, le brouillon et les envois en attente
// vivent dans le magasin (`postLive`), par compte et par publication ; chaque réponse porte un ticket et est jetée si le compte a changé.
import {
  type CommentDraft,
  createFlameGate,
  type FeedCommentPage,
  type FeedCommentReaction,
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
  type SheetState,
  sheetAddComment,
  sheetFind,
  sheetRemoveComment,
  sheetReopen,
  sheetSetReaction,
  sheetToggleReplies,
  sheetWithRepliesPage,
  sheetWithTopPage,
} from "@orasso/shared";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { apiFetch } from "../../lib/api.client";
import { onAccountChange, postLive } from "./commentsLive";

class CallError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: { method?: string; json?: unknown }): Promise<T> {
  const res = await apiFetch<T>(path, init);
  if (!res.ok) throw new CallError(res.status, res.error.code, res.error.message);
  return res.data;
}

const cursorQs = (cursor?: string | null) => (cursor ? `?cursor=${encodeURIComponent(cursor)}` : "");
const message = (e: unknown) => (e instanceof CallError ? e.message : "Une erreur est survenue. Réessaie.");
const statusOf = (e: unknown) => (e instanceof CallError ? e.status : -1);

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
  remove: (comment: FeedCommentView) => Promise<void>;
  fire: (comment: FeedCommentView) => void;
  setOff: (off: boolean) => Promise<void>;
};

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
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const id = post.id;
  const update = useCallback(
    (fn: (s: SheetState) => SheetState, ticket: LiveTicket) => postLive.updateSheet(id, fn, ticket),
    [id],
  );
  /** Une réponse de l'API d'un autre compte n'écrit ni la feuille ni la carte. */
  const emitPost = useCallback((next: FeedPostView, ticket: LiveTicket) => {
    if (postLive.alive(ticket)) onPostRef.current(next);
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
      try {
        const page = await call<FeedCommentPage>(`/feed-comments/${parentId}/replies${cursorQs(from)}`);
        // Une lecture plus récente de ce fil de réponses (même d'une autre instance) a pris la main : celle-ci est jetée.
        if (!postLive.fresh(t)) return;
        update((s) => sheetWithRepliesPage(s, parentId, page.items, page.nextCursor, !from), t);
      } catch (e) {
        if (!postLive.fresh(t)) return;
        // Parent introuvable (supprimé) : la publication se revalide, la liste relue retire la ligne.
        if (statusOf(e) === 404) {
          void loadTopRef.current?.();
          return;
        }
        if (mounted.current) setActionError(message(e));
      }
    },
    [update, id],
  );
  const loadTopRef = useRef<(() => Promise<void>) | null>(null);

  const loadTop = useCallback(
    async (from?: string | null) => {
      const t = from ? postLive.followRead(id, "top") : postLive.beginRead(id, "top");
      try {
        const page = await call<FeedCommentPage>(`/feed-posts/${id}/comments${cursorQs(from)}`);
        if (!postLive.fresh(t)) return;
        // Une lecture réussie rend la publication lisible (rouvrir ne suffit pas).
        postLive.clearGone(t);
        const next = update((s) => sheetWithTopPage(s, page.items, page.nextCursor, !from), t);
        if (mounted.current) setLoadError(null);
        // Les réponses restées dépliées se revalident (elles ont pu être supprimées ou devenir privées entre deux ouvertures).
        if (!from) {
          for (const [pid, r] of Object.entries(next.replies)) if (r.open && !r.loaded) void loadReplies(pid);
        }
      } catch (e) {
        if (!postLive.fresh(t) || postGone(e, t)) return;
        if (mounted.current) setLoadError(message(e));
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
        const created = await call<FeedCommentView>(`/feed-posts/${id}/comments`, {
          method: "POST",
          json: { text: p.text.trim(), parentId: p.parentId, clientId },
        });
        if (!postLive.alive(t)) return;
        let counted = 1;
        const next = update((s) => {
          const r = sheetAddComment(pendingDrop(s, clientId), created, p.parentId);
          counted = r.counted;
          return r.state;
        }, t);
        emitPost(postWithCommentAdded(postRef.current, created, p.parentId, counted), t);
        if (p.parentId && !next.replies[p.parentId]?.loaded) void loadReplies(p.parentId);
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
          void loadTop();
          return;
        }
        if (e instanceof CallError && status === 409 && e.code === "comments_off") {
          emitPost({ ...postRef.current, commentsOff: true }, t);
        }
        update((s) => pendingFail(s, clientId, status === 0 ? L.notSent : message(e)), t);
      }
    },
    [id, update, emitPost, loadReplies, loadTop, postGone],
  );

  const send = useCallback(
    (text: string, parentId: string | null) => {
      const clientId = crypto.randomUUID();
      update(
        (s) =>
          pendingStart(parentId ? sheetToggleReplies(s, parentId, true) : s, {
            clientId,
            text: text.trim(),
            parentId,
          }),
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

  const dropRemoved = useCallback(
    (commentId: string, t: LiveTicket) => {
      const { state, removed } = sheetRemoveComment(postLive.sheetOf(id), commentId);
      update(() => state, t);
      emitPost(postWithCommentRemoved(postRef.current, commentId, removed, state), t);
    },
    [id, update, emitPost],
  );

  const remove = useCallback(
    async (comment: FeedCommentView) => {
      const hasReplies = comment.repliesCount > 0 && postLive.sheetOf(id).items.some((c) => c.id === comment.id);
      if (!window.confirm(hasReplies ? L.deleteConfirm : L.deleteReplyConfirm)) return;
      const t = postLive.ticket(id);
      setActionError(null);
      try {
        await call<null>(`/feed-comments/${comment.id}`, { method: "DELETE" });
        if (postLive.alive(t)) dropRemoved(comment.id, t);
      } catch (e) {
        if (!postLive.alive(t)) return;
        // Déjà retiré (404 d'un commentaire) : seule la ligne part de l'écran ; la publication se revalide.
        if (statusOf(e) === 404) {
          dropRemoved(comment.id, t);
          void loadTop();
        } else if (mounted.current) setActionError(message(e));
      }
    },
    [id, dropRemoved, loadTop],
  );

  const fire = useCallback(
    (comment: FeedCommentView) => {
      const t = postLive.ticket(id);
      const current = sheetFind(postLive.sheetOf(id), comment.id) ?? comment;
      void flames.fire(
        comment.id,
        { reactionsCount: current.reactionsCount, reactedByMe: current.reactedByMe },
        {
          send: (on) =>
            call<FeedCommentReaction>(`/feed-comments/${comment.id}/reaction`, { method: on ? "PUT" : "DELETE" }),
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
        const res = await call<{ commentsOff: boolean }>(`/me/feed-posts/${id}/comments-off`, {
          method: "PUT",
          json: { off },
        });
        emitPost({ ...postRef.current, commentsOff: res.commentsOff }, t);
      } catch (e) {
        if (!postLive.alive(t) || postGone(e, t)) return;
        if (mounted.current) setActionError(message(e));
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
    remove,
    fire,
    setOff,
  };
}

/** Les personnes proposées après « @ » : relues 250 ms après la dernière frappe. */
export function useMentionSuggestions(postId: string, draft: MentionDraft | null): MentionSuggestion[] {
  const [items, setItems] = useState<MentionSuggestion[]>([]);
  const query = draft ? draft.query : null;
  // Un autre compte : la liste du précédent s'en va.
  useEffect(() => onAccountChange(() => setItems([])), []);
  useEffect(() => {
    if (query === null) {
      setItems([]);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      call<MentionSuggestion[]>(
        `/feed-posts/${postId}/mention-suggestions${query ? `?q=${encodeURIComponent(query)}` : ""}`,
      )
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
