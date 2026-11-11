// La feuille des commentaires d'une publication, sur le site (lot R8k2) : lecture par pages, réponses, envoi (la ligne apparaît
// tout de suite, grisée), flamme, suppression, « Couper les commentaires ». Même logique que l'appli ; les règles de fond sont dans
// l'API (lot R8k1) et les états dans `rules/feedCommentsList.ts` (pur, testé).
import {
  emptySheet,
  type FeedCommentPage,
  type FeedCommentReaction,
  type FeedCommentView,
  type FeedPostView,
  feedCommentScreenLabels as L,
  type MentionDraft,
  type MentionSuggestion,
  pendingDrop,
  pendingFail,
  pendingRetry,
  pendingStart,
  postWithCommentAdded,
  postWithCommentRemoved,
  reactionGuess,
  type SheetState,
  sheetAddComment,
  sheetFind,
  sheetRemoveComment,
  sheetSetReaction,
  sheetToggleReplies,
  sheetWithRepliesPage,
  sheetWithTopPage,
} from "@orasso/shared";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch } from "../../lib/api.client";

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

export type CommentsController = {
  sheet: SheetState;
  loadError: string | null;
  /** La publication n'est plus lisible (404). */
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
  const [sheet, setSheetState] = useState<SheetState>(emptySheet);
  const sheetRef = useRef(sheet);
  const postRef = useRef(post);
  postRef.current = post;
  const [loadError, setLoadError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // Seule la dernière lecture de la première page compte.
  const seq = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Source de vérité : la valeur courante, lue et écrite sans attendre un rendu. */
  const update = useCallback((fn: (s: SheetState) => SheetState) => {
    const next = fn(sheetRef.current);
    sheetRef.current = next;
    if (mounted.current) setSheetState(next);
    return next;
  }, []);

  const handleGone = useCallback((e: unknown) => {
    if (statusOf(e) === 404 && mounted.current) setGone(true);
  }, []);

  const loadTop = useCallback(
    async (from?: string | null) => {
      const mine = from ? seq.current : ++seq.current;
      try {
        const page = await call<FeedCommentPage>(`/feed-posts/${postRef.current.id}/comments${cursorQs(from)}`);
        if (mine !== seq.current) return;
        update((s) => sheetWithTopPage(s, page.items, page.nextCursor, !from));
        setLoadError(null);
      } catch (e) {
        if (mine !== seq.current) return;
        handleGone(e);
        setLoadError(message(e));
      }
    },
    [update, handleGone],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: seule l'ouverture (ou une autre publication) relit.
  useEffect(() => {
    if (!active) return;
    setGone(false);
    setActionError(null);
    void loadTop();
  }, [active, post.id]);

  const loadReplies = useCallback(
    async (parentId: string, from?: string | null) => {
      try {
        const page = await call<FeedCommentPage>(`/feed-comments/${parentId}/replies${cursorQs(from)}`);
        update((s) => sheetWithRepliesPage(s, parentId, page.items, page.nextCursor, !from));
      } catch (e) {
        handleGone(e);
        setActionError(message(e));
      }
    },
    [update, handleGone],
  );

  const toggleReplies = useCallback(
    (parentId: string) => {
      const was = sheetRef.current.replies[parentId];
      const next = update((s) => sheetToggleReplies(s, parentId));
      if (!was?.loaded && next.replies[parentId]?.open) void loadReplies(parentId);
    },
    [update, loadReplies],
  );

  const submit = useCallback(
    async (clientId: string) => {
      const p = sheetRef.current.pending.find((x) => x.clientId === clientId);
      if (!p) return;
      try {
        const created = await call<FeedCommentView>(`/feed-posts/${postRef.current.id}/comments`, {
          method: "POST",
          json: { text: p.text.trim(), parentId: p.parentId, clientId },
        });
        let counted = 1;
        const next = update((s) => {
          const r = sheetAddComment(pendingDrop(s, clientId), created, p.parentId);
          counted = r.counted;
          return r.state;
        });
        onPost(postWithCommentAdded(postRef.current, created, p.parentId, counted));
        if (p.parentId && !next.replies[p.parentId]?.loaded) void loadReplies(p.parentId);
      } catch (e) {
        const status = statusOf(e);
        if (status === 404) handleGone(e);
        if (e instanceof CallError && status === 409 && e.code === "comments_off") {
          onPost({ ...postRef.current, commentsOff: true });
        }
        update((s) => pendingFail(s, clientId, status === 0 ? L.notSent : message(e)));
      }
    },
    [update, onPost, loadReplies, handleGone],
  );

  const send = useCallback(
    (text: string, parentId: string | null) => {
      const clientId = crypto.randomUUID();
      update((s) =>
        pendingStart(parentId ? sheetToggleReplies(s, parentId, true) : s, { clientId, text: text.trim(), parentId }),
      );
      void submit(clientId);
    },
    [update, submit],
  );

  const retry = useCallback(
    (clientId: string) => {
      update((s) => pendingRetry(s, clientId));
      void submit(clientId);
    },
    [update, submit],
  );

  const dropRemoved = useCallback(
    (id: string) => {
      const { state, removed } = sheetRemoveComment(sheetRef.current, id);
      update(() => state);
      onPost(postWithCommentRemoved(postRef.current, id, removed, state));
    },
    [update, onPost],
  );

  const remove = useCallback(
    async (comment: FeedCommentView) => {
      const hasReplies = comment.repliesCount > 0 && sheetRef.current.items.some((c) => c.id === comment.id);
      if (!window.confirm(hasReplies ? L.deleteConfirm : L.deleteReplyConfirm)) return;
      setActionError(null);
      try {
        await call<null>(`/feed-comments/${comment.id}`, { method: "DELETE" });
        dropRemoved(comment.id);
      } catch (e) {
        handleGone(e);
        // Déjà retiré (404) : la ligne part aussi de l'écran.
        if (statusOf(e) === 404) dropRemoved(comment.id);
        else setActionError(message(e));
      }
    },
    [dropRemoved, handleGone],
  );

  const fire = useCallback(
    (comment: FeedCommentView) => {
      const current = sheetFind(sheetRef.current, comment.id) ?? comment;
      const before = { reactionsCount: current.reactionsCount, reactedByMe: current.reactedByMe };
      const on = !before.reactedByMe;
      update((s) => sheetSetReaction(s, comment.id, reactionGuess(before, on)));
      call<FeedCommentReaction>(`/feed-comments/${comment.id}/reaction`, { method: on ? "PUT" : "DELETE" })
        .then((res) => update((s) => sheetSetReaction(s, comment.id, res)))
        .catch((e: unknown) => {
          handleGone(e);
          update((s) => sheetSetReaction(s, comment.id, before));
        });
    },
    [update, handleGone],
  );

  const setOff = useCallback(
    async (off: boolean) => {
      setActionError(null);
      try {
        const res = await call<{ commentsOff: boolean }>(`/me/feed-posts/${postRef.current.id}/comments-off`, {
          method: "PUT",
          json: { off },
        });
        onPost({ ...postRef.current, commentsOff: res.commentsOff });
      } catch (e) {
        setActionError(message(e));
      }
    },
    [onPost],
  );

  return {
    sheet,
    loadError,
    gone,
    actionError,
    loadMore: () => {
      const cursor = sheetRef.current.cursor;
      if (cursor) void loadTop(cursor);
    },
    retryLoad: () => void loadTop(),
    toggleReplies,
    loadMoreReplies: (parentId) => {
      const cursor = sheetRef.current.replies[parentId]?.cursor;
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
