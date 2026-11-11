// La feuille des commentaires d'une publication (lot R8k2) : lecture par pages, réponses, envoi (la ligne apparaît tout de
// suite, grisée), flamme, suppression, « Couper les commentaires ». Aucune règle de fond : l'API les tient (lot R8k1) ; les
// états et les compteurs sont dans `rules/feedCommentsList.ts` (pur, testé).
import {
  emptySheet,
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
import { randomUUID } from "expo-crypto";
import { useCallback, useEffect, useRef, useState } from "react";

import { confirmRemove } from "@/features/crews/feed/confirm";
import { api } from "@/lib/api";
import { ApiRequestError, errorMessage } from "@/lib/http";
import { cacheScope } from "@/lib/kv";
import { createRequestGate } from "@/lib/requestGate";

const statusOf = (e: unknown) => (e instanceof ApiRequestError ? e.status : -1);

export type CommentsController = {
  sheet: SheetState;
  loadError: string | null;
  /** La publication n'est plus lisible (404) : la feuille se ferme avec un message. */
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
  const gate = useRef(createRequestGate(cacheScope)).current;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Source de vérité : la valeur courante, lue et écrite sans attendre un rendu (les fonctions asynchrones ne lisent rien de périmé). */
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
      const ticket = from ? gate.follow() : gate.start();
      try {
        const page = await api.feedComments(postRef.current.id, from);
        if (!ticket.current()) return;
        update((s) => sheetWithTopPage(s, page.items, page.nextCursor, !from));
        setLoadError(null);
      } catch (e) {
        if (!ticket.current()) return;
        handleGone(e);
        setLoadError(errorMessage(e));
      }
    },
    [gate, update, handleGone],
  );

  // La feuille s'ouvre : première page (relue à chaque ouverture, sans effacer ce qui est affiché en attendant).
  // biome-ignore lint/correctness/useExhaustiveDependencies: seule l'ouverture (ou une autre publication) relit.
  useEffect(() => {
    if (!active) return;
    setGone(false);
    setActionError(null);
    void loadTop();
  }, [active, post.id]);

  // Changement de compte : rien de l'ancien compte ne reste (la première lecture, elle, n'est pas jetée).
  const account = cacheScope();
  const lastAccount = useRef(account);
  useEffect(() => {
    if (lastAccount.current === account) return;
    lastAccount.current = account;
    gate.invalidate();
    update(() => emptySheet());
  }, [account, gate, update]);

  const loadReplies = useCallback(
    async (parentId: string, from?: string | null) => {
      try {
        const page = await api.feedCommentReplies(parentId, from);
        update((s) => sheetWithRepliesPage(s, parentId, page.items, page.nextCursor, !from));
      } catch (e) {
        handleGone(e);
        setActionError(errorMessage(e));
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
        const created = await api.createFeedComment(postRef.current.id, {
          text: p.text.trim(),
          parentId: p.parentId,
          clientId,
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
        if (status === 409 && e instanceof ApiRequestError && e.code === "comments_off") {
          onPost({ ...postRef.current, commentsOff: true });
        }
        update((s) => pendingFail(s, clientId, status === 0 ? L.notSent : errorMessage(e)));
      }
    },
    [update, onPost, loadReplies, handleGone],
  );

  const send = useCallback(
    (text: string, parentId: string | null) => {
      const clientId = randomUUID();
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

  const discard = useCallback((clientId: string) => update((s) => pendingDrop(s, clientId)), [update]);

  const remove = useCallback(
    async (comment: FeedCommentView) => {
      const hasReplies = comment.repliesCount > 0 && sheetRef.current.items.some((c) => c.id === comment.id);
      if (!(await confirmRemove(hasReplies ? L.deleteConfirm : L.deleteReplyConfirm))) return;
      setActionError(null);
      try {
        await api.removeFeedComment(comment.id);
        const { state, removed } = sheetRemoveComment(sheetRef.current, comment.id);
        update(() => state);
        onPost(postWithCommentRemoved(postRef.current, comment.id, removed, state));
      } catch (e) {
        handleGone(e);
        // Déjà retiré (404) : la ligne part aussi de l'écran.
        if (statusOf(e) === 404) {
          const { state, removed } = sheetRemoveComment(sheetRef.current, comment.id);
          update(() => state);
          onPost(postWithCommentRemoved(postRef.current, comment.id, removed, state));
        } else setActionError(errorMessage(e));
      }
    },
    [update, onPost, handleGone],
  );

  const fire = useCallback(
    (comment: FeedCommentView) => {
      const current = sheetFind(sheetRef.current, comment.id) ?? comment;
      const before = { reactionsCount: current.reactionsCount, reactedByMe: current.reactedByMe };
      const on = !before.reactedByMe;
      update((s) => sheetSetReaction(s, comment.id, reactionGuess(before, on)));
      api
        .fireFeedComment(comment.id, on)
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
        const res = await api.setFeedCommentsOff(postRef.current.id, off);
        onPost({ ...postRef.current, commentsOff: res.commentsOff });
      } catch (e) {
        setActionError(errorMessage(e));
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
