// L'écran des commentaires d'une publication du Fil, sans React ni réseau (lot R8k2, testé par `feedCommentsList.test.ts`) :
// l'état de la feuille (pages, réponses dépliées, envois en attente), les compteurs de la carte, la saisie d'un « @ ». Les
// règles de fond (qui voit, un seul niveau, 300 caractères) sont dans l'API et dans `rules/feedComments.ts` ; ici seulement
// ce que l'écran garde en mémoire. L'appli et le site lisent les mêmes fonctions.

import type { FeedCommentPreview, FeedPostView } from "../schemas/feed";
import type { FeedCommentView } from "../schemas/feedComments";
import { FEED_COMMENT_MAX, FEED_COMMENT_PREVIEW_COUNT } from "./feedComments";

// --- La feuille ------------------------------------------------------------------------------------------------------

/** Les réponses d'un commentaire de premier niveau : repliées par défaut, lues à l'ouverture. */
export type RepliesState = {
  items: FeedCommentView[];
  cursor: string | null;
  /** Dépliées à l'écran. */
  open: boolean;
  /** Une première lecture a abouti (remis à faux à chaque réouverture : les réponses se revalident au dépliage). */
  loaded: boolean;
  /** Réponses confirmées par l'API depuis la dernière revalidation : une page qui arrive ne les efface pas (réconciliation par identifiant). */
  recent: string[];
};

/** Un envoi que l'API n'a pas encore confirmé : la ligne s'affiche tout de suite, grisée. Le `clientId` est gardé à chaque essai. */
export type PendingComment = {
  clientId: string;
  text: string;
  /** Le commentaire de premier niveau visé, ou `null`. */
  parentId: string | null;
  status: "sending" | "failed";
  error: string | null;
};

export type SheetState = {
  items: FeedCommentView[];
  cursor: string | null;
  loaded: boolean;
  replies: Record<string, RepliesState>;
  pending: PendingComment[];
  /** Commentaires de premier niveau confirmés depuis la dernière ouverture : une première page tardive ne les efface pas. */
  recent: string[];
};

export const emptySheet = (): SheetState => ({
  items: [],
  cursor: null,
  loaded: false,
  replies: {},
  pending: [],
  recent: [],
});

const emptyReplies = (): RepliesState => ({ items: [], cursor: null, open: false, loaded: false, recent: [] });

/** Du plus ancien au plus récent, comme l'API (date, puis identifiant). */
const chronological = (a: FeedCommentView, b: FeedCommentView) =>
  a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** Fusionne par identifiant (le plus récent écrase), du plus ancien au plus récent : relire une page ne double rien. */
export function mergeComments(
  current: readonly FeedCommentView[],
  next: readonly FeedCommentView[],
): FeedCommentView[] {
  const byId = new Map<string, FeedCommentView>();
  for (const c of current) byId.set(c.id, c);
  for (const c of next) byId.set(c.id, c);
  return [...byId.values()].sort(chronological);
}

/**
 * Une première page qui arrive : ce qu'elle apporte fait foi, et les ajouts confirmés depuis (`recent`) qu'elle ne contient pas
 * (envoyés après son départ) restent, **dans leur version locale la plus fraîche** (compteurs de réponses, flammes) : jamais une
 * copie ancienne qui masquerait une réponse.
 */
function withLocalAdditions(
  page: readonly FeedCommentView[],
  local: readonly FeedCommentView[],
  recent: readonly string[],
): FeedCommentView[] {
  const inPage = new Set(page.map((c) => c.id));
  const keep = local.filter((c) => recent.includes(c.id) && !inPage.has(c.id));
  return mergeComments(keep, page);
}

/**
 * Applique une page de premier niveau. Sans curseur envoyé (`first`) : la liste est remplacée (on garde ce qu'on vient
 * d'écrire s'il n'y est pas encore). Sinon la page s'ajoute à la suite.
 */
export function sheetWithTopPage(
  state: SheetState,
  items: readonly FeedCommentView[],
  nextCursor: string | null,
  first: boolean,
): SheetState {
  return {
    ...state,
    items: first ? withLocalAdditions(items, state.items, state.recent) : mergeComments(state.items, items),
    cursor: nextCursor,
    loaded: true,
  };
}

/** Applique une page de réponses (la première remplace). Ne change ni l'ouverture ni le compteur du parent. */
export function sheetWithRepliesPage(
  state: SheetState,
  parentId: string,
  items: readonly FeedCommentView[],
  nextCursor: string | null,
  first: boolean,
): SheetState {
  const was = state.replies[parentId] ?? emptyReplies();
  return {
    ...state,
    replies: {
      ...state.replies,
      [parentId]: {
        ...was,
        items: first ? withLocalAdditions(items, was.items, was.recent) : mergeComments(was.items, items),
        cursor: nextCursor,
        loaded: true,
      },
    },
  };
}

/** Déplie ou replie les réponses d'un commentaire. */
export function sheetToggleReplies(state: SheetState, parentId: string, open?: boolean): SheetState {
  const was = state.replies[parentId] ?? emptyReplies();
  return { ...state, replies: { ...state.replies, [parentId]: { ...was, open: open ?? !was.open } } };
}

const patchTop = (items: readonly FeedCommentView[], id: string, patch: (c: FeedCommentView) => FeedCommentView) =>
  items.map((c) => (c.id === id ? patch(c) : c));

/**
 * Ajoute le commentaire que l'API vient de rendre. Premier niveau : à la suite de la liste. Réponse (`parentId`) : sous son
 * commentaire, dont le compteur de réponses monte, et les réponses s'ouvrent. Le même commentaire rendu deux fois (envoi rejoué)
 * ne compte qu'une fois. Rend `counted` : ce que le compteur de la carte doit gagner (0 ou 1).
 */
export function sheetAddComment(
  state: SheetState,
  comment: FeedCommentView,
  parentId: string | null,
): { state: SheetState; counted: number } {
  if (!parentId) {
    const known = state.items.some((c) => c.id === comment.id);
    return {
      state: {
        ...state,
        items: mergeComments(state.items, [comment]),
        recent: known || state.recent.includes(comment.id) ? state.recent : [...state.recent, comment.id],
      },
      counted: known ? 0 : 1,
    };
  }
  const was = state.replies[parentId] ?? emptyReplies();
  const known = was.items.some((c) => c.id === comment.id);
  return {
    state: {
      ...state,
      items: known ? state.items : patchTop(state.items, parentId, (c) => ({ ...c, repliesCount: c.repliesCount + 1 })),
      replies: {
        ...state.replies,
        [parentId]: {
          ...was,
          items: mergeComments(was.items, [comment]),
          recent: known || was.recent.includes(comment.id) ? was.recent : [...was.recent, comment.id],
          open: true,
        },
      },
    },
    counted: known ? 0 : 1,
  };
}

/**
 * Retire un commentaire de l'affichage. Un commentaire de premier niveau emporte ses réponses (l'API les retire de la vue) :
 * `removed` est ce que le compteur de la carte perd (1 + ses réponses). Une réponse : 1, et le compteur de son parent baisse.
 * Un commentaire inconnu ne change rien (`removed` 0).
 */
export function sheetRemoveComment(state: SheetState, id: string): { state: SheetState; removed: number } {
  const top = state.items.find((c) => c.id === id);
  if (top) {
    const { [id]: _gone, ...replies } = state.replies;
    return {
      state: {
        ...state,
        items: state.items.filter((c) => c.id !== id),
        replies,
        recent: state.recent.filter((x) => x !== id),
      },
      removed: 1 + top.repliesCount,
    };
  }
  for (const [parentId, r] of Object.entries(state.replies)) {
    if (!r.items.some((c) => c.id === id)) continue;
    return {
      state: {
        ...state,
        items: patchTop(state.items, parentId, (c) => ({ ...c, repliesCount: Math.max(0, c.repliesCount - 1) })),
        replies: {
          ...state.replies,
          [parentId]: { ...r, items: r.items.filter((c) => c.id !== id), recent: r.recent.filter((x) => x !== id) },
        },
      },
      removed: 1,
    };
  }
  return { state, removed: 0 };
}

/** La flamme d'un commentaire (premier niveau ou réponse), telle que l'API la rend. */
export function sheetSetReaction(
  state: SheetState,
  id: string,
  reaction: { reactionsCount: number; reactedByMe: boolean },
): SheetState {
  const patch = (c: FeedCommentView) => (c.id === id ? { ...c, ...reaction } : c);
  return {
    ...state,
    items: state.items.map(patch),
    replies: Object.fromEntries(
      Object.entries(state.replies).map(([k, r]) => [k, { ...r, items: r.items.map(patch) }]),
    ),
  };
}

/** La flamme tout de suite (avant la réponse de l'API) : annulée en rejouant l'état d'avant. */
export function reactionGuess(c: Pick<FeedCommentView, "reactionsCount" | "reactedByMe">, on: boolean) {
  return { reactedByMe: on, reactionsCount: Math.max(0, c.reactionsCount + (on === c.reactedByMe ? 0 : on ? 1 : -1)) };
}

/** Le commentaire (premier niveau ou réponse) dans la feuille. */
export function sheetFind(state: SheetState, id: string): FeedCommentView | undefined {
  return (
    state.items.find((c) => c.id === id) ??
    Object.values(state.replies)
      .flatMap((r) => r.items)
      .find((c) => c.id === id)
  );
}

/**
 * La feuille se rouvre : les réponses déjà lues ne sont plus sûres (supprimées, devenues privées entre-temps) : elles se revalident au
 * dépliage, et les ajouts confirmés de la séance précédente ne comptent plus (la première page, relue, fait foi). Les envois en
 * attente restent.
 */
export function sheetReopen(state: SheetState): SheetState {
  return {
    ...state,
    recent: [],
    replies: Object.fromEntries(
      Object.entries(state.replies).map(([id, r]) => [id, { ...r, loaded: false, recent: [] }]),
    ),
  };
}

// --- La flamme d'un commentaire : une mutation à la fois -----------------------------------------------------------------

type FlameState = { reactionsCount: number; reactedByMe: boolean };

/**
 * Sérialise les flammes par commentaire : des touchers rapides ne partent pas en parallèle (leurs réponses pourraient arriver dans le
 * désordre et inverser l'état). On garde la **dernière intention** ; chaque envoi attend le précédent, seul le dernier résultat s'affiche,
 * et une panne remet l'état connu de l'API (jamais une annulation périmée).
 */
export function createFlameGate() {
  const running = new Map<string, { want: boolean; known: FlameState }>();
  return {
    /**
     * `current` : ce que l'écran montre. `send(on)` : l'appel de l'API. `apply` : écrit l'état à l'écran. `alive` : le compte n'a pas changé.
     * Rend la promesse de la fin de la série.
     */
    fire(
      id: string,
      current: FlameState,
      io: {
        send: (on: boolean) => Promise<FlameState>;
        apply: (state: FlameState) => void;
        alive?: () => boolean;
      },
    ): Promise<void> {
      const live = running.get(id);
      const on = !(live ? live.want : current.reactedByMe);
      io.apply(reactionGuess(live ? { reactionsCount: current.reactionsCount, reactedByMe: live.want } : current, on));
      if (live) {
        live.want = on;
        return Promise.resolve();
      }
      const entry = { want: on, known: current };
      running.set(id, entry);
      return (async () => {
        let last: FlameState = entry.known;
        try {
          for (;;) {
            // Le compte a changé pendant la série : aucun nouvel envoi ne part sous la session suivante.
            if (io.alive && !io.alive()) return;
            const sent = entry.want;
            last = await io.send(sent);
            if (entry.want === sent) break;
          }
        } catch {
          // Panne : l'état connu de l'API (le dernier rendu, ou celui d'avant le premier toucher).
        } finally {
          running.delete(id);
        }
        if (io.alive && !io.alive()) return;
        io.apply(last);
      })();
    },
  };
}

// --- Les envois en attente ---------------------------------------------------------------------------------------------

/** Un envoi commence : la ligne apparaît grisée. Un même `clientId` n'est jamais ajouté deux fois. */
export function pendingStart(state: SheetState, p: Omit<PendingComment, "status" | "error">): SheetState {
  if (state.pending.some((x) => x.clientId === p.clientId)) return pendingRetry(state, p.clientId);
  return { ...state, pending: [...state.pending, { ...p, status: "sending", error: null }] };
}

/** Échec ou pas de réseau : la ligne dit « Non envoyé » ; le texte et le `clientId` restent. */
export const pendingFail = (state: SheetState, clientId: string, error: string | null): SheetState => ({
  ...state,
  pending: state.pending.map((p) => (p.clientId === clientId ? { ...p, status: "failed", error } : p)),
});

/** « Réessayer » : même `clientId`, la ligne redevient grisée. */
export const pendingRetry = (state: SheetState, clientId: string): SheetState => ({
  ...state,
  pending: state.pending.map((p) => (p.clientId === clientId ? { ...p, status: "sending", error: null } : p)),
});

/** L'API a répondu (ou l'envoi est abandonné) : la ligne grisée s'en va. */
export const pendingDrop = (state: SheetState, clientId: string): SheetState => ({
  ...state,
  pending: state.pending.filter((p) => p.clientId !== clientId),
});

// --- Les compteurs de la carte ----------------------------------------------------------------------------------------

const previewOf = (c: FeedCommentView): FeedCommentPreview => ({
  id: c.id,
  author: c.author,
  text: c.text,
  createdAt: c.createdAt,
});

/**
 * La publication après un commentaire ajouté : le total monte de `counted` (réponses comprises) ; un commentaire de premier
 * niveau prend la dernière place des deux montrés sous la carte, une réponse n'y va pas.
 */
export function postWithCommentAdded(
  post: FeedPostView,
  comment: FeedCommentView,
  parentId: string | null,
  counted = 1,
): FeedPostView {
  if (counted === 0) return post;
  const lastComments =
    parentId || post.lastComments.some((c) => c.id === comment.id)
      ? post.lastComments
      : [...post.lastComments, previewOf(comment)].slice(-FEED_COMMENT_PREVIEW_COUNT);
  return { ...post, commentsCount: post.commentsCount + counted, lastComments };
}

/**
 * La publication après un retrait : le total baisse de `removed`, le commentaire part des deux montrés sous la carte. Quand la
 * feuille a lu toute la liste (`sheet.cursor` nul), les deux derniers sont relus d'elle, sinon il n'en reste qu'un jusqu'à la
 * prochaine lecture du Fil.
 */
export function postWithCommentRemoved(
  post: FeedPostView,
  id: string,
  removed: number,
  sheet: SheetState | null,
): FeedPostView {
  if (removed === 0) return post;
  const kept = post.lastComments.filter((c) => c.id !== id);
  const lastComments =
    sheet?.loaded && sheet.cursor === null ? sheet.items.slice(-FEED_COMMENT_PREVIEW_COUNT).map(previewOf) : kept;
  return { ...post, commentsCount: Math.max(0, post.commentsCount - removed), lastComments };
}

// --- La saisie --------------------------------------------------------------------------------------------------------

/** Pas de commentaire vide, jamais plus de 300 caractères (la même mesure que l'API : texte rogné). */
export type CommentIssue = "empty" | "too_long";

export function commentIssue(text: string): CommentIssue | null {
  const n = text.trim().length;
  if (n === 0) return "empty";
  return n > FEED_COMMENT_MAX ? "too_long" : null;
}

/** Le compteur n'apparaît que près de la limite (à partir de 260 caractères). */
export const COMMENT_COUNTER_FROM = 260;
export const commentCounter = (text: string): { shown: boolean; length: number; max: number } => ({
  shown: text.length >= COMMENT_COUNTER_FROM,
  length: text.length,
  max: FEED_COMMENT_MAX,
});

/** « Voir les 12 commentaires », « Voir le commentaire » pour un seul. */
export const lastCommentsLine = (n: number): string => (n === 1 ? "Voir le commentaire" : `Voir les ${n} commentaires`);

/** Le titre de la feuille : « 12 commentaires », « 1 commentaire », « Commentaires » sans aucun. */
export const commentsTitle = (n: number): string =>
  n <= 0 ? "Commentaires" : n === 1 ? "1 commentaire" : `${n} commentaires`;

/** « Voir les 3 réponses », « Voir la réponse ». */
export const repliesLine = (n: number): string => (n === 1 ? "Voir la réponse" : `Voir les ${n} réponses`);

const PSEUDO_CHAR = /[A-Za-z0-9_.]/;
const WORD_CHAR = /[\p{L}\p{N}_@]/u;

/** Le mot « @… » qu'on est en train de taper. `start` est la place du « @ », `end` la fin du mot (le curseur ou plus loin). */
export type MentionDraft = { query: string; start: number; end: number };

/**
 * Le mot « @… » en cours de saisie, d'après le texte et la place du curseur, ou `null`. Le « @ » doit commencer le texte ou suivre
 * un blanc ou une ponctuation (jamais le milieu d'un mot ni d'une adresse e-mail) ; entre lui et le curseur, que des signes de
 * pseudo. `query` est ce qui suit le « @ » jusqu'au curseur (peut être vide : « @ » seul propose mes liens).
 */
export function mentionQuery(text: string, caret: number): MentionDraft | null {
  const at = Math.max(0, Math.min(caret, text.length));
  let i = at - 1;
  while (i >= 0 && PSEUDO_CHAR.test(text.charAt(i))) i -= 1;
  if (i < 0 || text.charAt(i) !== "@") return null;
  const before = i > 0 ? text.charAt(i - 1) : "";
  if (before && WORD_CHAR.test(before)) return null;
  const query = text.slice(i + 1, at);
  if (query.length > 24) return null;
  let end = at;
  while (end < text.length && PSEUDO_CHAR.test(text.charAt(end))) end += 1;
  return { query, start: i, end };
}

/**
 * Pose `@pseudo ` à la place du mot en cours (le reste du mot après le curseur part avec), et rend le texte et la nouvelle place
 * du curseur. Rend `null` quand il n'y a pas de mot en cours ou que le texte dépasserait 300 caractères.
 */
export function insertMention(text: string, caret: number, pseudo: string): { text: string; caret: number } | null {
  const draft = mentionQuery(text, caret);
  if (!draft) return null;
  const rest = text.slice(draft.end);
  const insert = `@${pseudo}${rest.startsWith(" ") ? "" : " "}`;
  const next = `${text.slice(0, draft.start)}${insert}${rest}`;
  if (next.length > FEED_COMMENT_MAX) return null;
  return { text: next, caret: draft.start + insert.length + (rest.startsWith(" ") ? 1 : 0) };
}

/** Un morceau d'un commentaire : du texte, ou un pseudo cité que l'API a reconnu (rendu en couleur). */
export type MentionPart = { text: string; mention: string | null };

const MENTION_AT = /@([A-Za-z0-9_.]{3,24})/g;

/**
 * Découpe un commentaire en morceaux : ne rend en lien **que** les pseudos que l'API a mis dans `mentions` (un « @mot » qu'elle
 * n'a pas reconnu reste du texte). Mêmes bords que `commentMentions` : jamais dans un mot ni une adresse, un point final de
 * phrase n'est pas du pseudo.
 */
export function mentionParts(text: string, mentions: readonly string[]): MentionPart[] {
  const known = new Set(mentions.map((m) => m.toLowerCase()));
  if (known.size === 0 || !text.includes("@")) return [{ text, mention: null }];
  const parts: MentionPart[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION_AT)) {
    const at = m.index ?? 0;
    const before = at > 0 ? text.charAt(at - 1) : "";
    const prev = at > 1 && /[\uDC00-\uDFFF]/.test(before) ? text.slice(at - 2, at) : before;
    if (prev && WORD_CHAR.test(prev)) continue;
    const raw = m[1] ?? "";
    const next = text.charAt(at + 1 + raw.length);
    if (next && /[A-Za-z0-9_]/.test(next)) continue;
    const pseudo = raw.replace(/\.+$/, "");
    if (pseudo.length < 3 || !known.has(pseudo.toLowerCase())) continue;
    if (at > last) parts.push({ text: text.slice(last, at), mention: null });
    parts.push({ text: `@${pseudo}`, mention: pseudo });
    last = at + 1 + pseudo.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), mention: null });
  return parts.length ? parts : [{ text, mention: null }];
}

// --- La carte et sa feuille s'accordent --------------------------------------------------------------------------------

/**
 * Ce que la ligne d'actions, les deux commentaires sous la carte et la feuille partagent pour une publication : le total, les
 * commentaires coupés, les deux derniers, et laquelle des feuilles est ouverte. Un petit magasin sans React (l'appli et le site
 * le lisent par `useSyncExternalStore`) : ainsi `PostActions`, `LastComments` et la feuille n'ont besoin que de `post`, et se
 * posent tels quels ailleurs que dans le Fil (profil, fiche, pages).
 */
type LiveFields = Pick<FeedPostView, "commentsCount" | "commentsOff" | "lastComments">;
type LiveEntry = { base: string; fields: LiveFields };

const baseKey = (p: FeedPostView) =>
  `${p.commentsCount}|${p.commentsOff ? 1 : 0}|${p.lastComments.map((c) => c.id).join(",")}`;

export type CommentsOpening = { postId: string; focus: boolean };

/** Ce que la personne a commencé d'écrire sous une publication : gardé hors du montage des cartes (changer de filtre ne le perd pas). */
export type CommentDraft = { text: string; replyTo: { id: string; pseudo: string } | null };
const emptyDraft = (): CommentDraft => ({ text: "", replyTo: null });

type Thread = { sheet: SheetState; draft: CommentDraft };

/** Ce qu'une réponse de l'API doit prouver avant d'écrire : le compte (génération), la publication (404 ou autre compte) et, pour une lecture, son rang. */
export type LiveTicket = { g: number; id: string; p: number };
export type ReadTicket = LiveTicket & { key: string; c: number };

export function createPostLiveStore() {
  const entries = new Map<string, LiveEntry>();
  const threads = new Map<string, Thread>();
  const gone = new Set<string>();
  const subs = new Set<() => void>();
  let opening: CommentsOpening | null = null;
  let version = 0;
  let account: string | null | undefined;
  let generation = 0;
  /** Génération de chaque publication : change au 404 (les réponses parties avant ne comptent plus). */
  const postGen = new Map<string, number>();
  /** Rang des lectures par fil (`<publication>|top`, `<publication>|r:<commentaire>`) : seule la dernière partie compte, même d'une autre instance. */
  const reads = new Map<string, number>();
  /** Les instances de `PostActions` montées pour chaque publication : porte la feuille celle dont l'écran est affiché (sinon la première). */
  const hosts = new Map<string, { id: string; focused: boolean }[]>();
  const emit = () => {
    version += 1;
    for (const fn of subs) fn();
  };
  const threadOf = (postId: string): Thread => threads.get(postId) ?? { sheet: emptySheet(), draft: emptyDraft() };
  const pg = (postId: string) => postGen.get(postId) ?? 0;
  const reset = () => {
    entries.clear();
    threads.clear();
    gone.clear();
    postGen.clear();
    reads.clear();
    opening = null;
    generation += 1;
  };
  /** Une écriture est valable pour le bon compte, la bonne génération de publication, et une publication encore lisible. */
  const writable = (t: LiveTicket) => t.g === generation && t.p === pg(t.id) && !gone.has(t.id);
  return {
    subscribe(fn: () => void) {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
    /** Change à chaque modification (instantané de `useSyncExternalStore`). */
    version: () => version,
    /**
     * Le compte qui regarde (`null` : personne). Un autre compte, ou aucun : tout ce qui appartient au précédent s'en va (publications
     * changées, fils, brouillons, envois en attente) et les réponses encore en route sont jetées.
     */
    setAccount(next: string | null, silent = false) {
      if (account === next) return;
      const changed = account !== undefined;
      account = next;
      if (!changed) return;
      reset();
      if (!silent) emit();
    },
    /** Le ticket d'une écriture sur cette publication : à prendre au départ de l'appel, rendu à chaque écriture. */
    ticket: (postId: string): LiveTicket => ({ g: generation, id: postId, p: pg(postId) }),
    /** La réponse de l'API peut-elle encore écrire (même compte, même génération de publication) ? */
    alive: (t: LiveTicket): boolean => t.g === generation && t.p === pg(t.id),
    /** Une nouvelle lecture d'un fil (`channel` : `top` ou `r:<commentaire>`) : les précédentes, même d'une autre instance, ne comptent plus. */
    beginRead(postId: string, channel: string): ReadTicket {
      const key = `${postId}|${channel}`;
      const c = (reads.get(key) ?? 0) + 1;
      reads.set(key, c);
      return { ...this.ticket(postId), key, c };
    },
    /** La suite d'une lecture (page suivante) : valable tant qu'aucune autre lecture du même fil n'est partie. */
    followRead(postId: string, channel: string): ReadTicket {
      const key = `${postId}|${channel}`;
      return { ...this.ticket(postId), key, c: reads.get(key) ?? 0 };
    },
    /** La lecture est-elle toujours la dernière de son fil (et la réponse d'un compte et d'une publication encore valables) ? */
    fresh: (t: ReadTicket): boolean => t.g === generation && t.p === pg(t.id) && (reads.get(t.key) ?? 0) === t.c,
    /**
     * La publication telle qu'on la montre : ce que l'écran a changé depuis, tant que la publication reçue de l'API est celle d'alors.
     */
    apply(server: FeedPostView): FeedPostView {
      const entry = entries.get(server.id);
      if (!entry) return server;
      if (entry.base !== baseKey(server)) {
        entries.delete(server.id);
        return server;
      }
      return { ...server, ...entry.fields };
    },
    /** Retient la publication changée (`next`) par-dessus celle de l'API (`server`). */
    set(server: FeedPostView, next: FeedPostView, ticket?: LiveTicket) {
      if (ticket ? !writable(ticket) : gone.has(server.id)) return;
      entries.set(server.id, {
        base: baseKey(server),
        fields: { commentsCount: next.commentsCount, commentsOff: next.commentsOff, lastComments: next.lastComments },
      });
      emit();
    },
    /** Le fil (liste, réponses, envois en attente) d'une publication. */
    sheetOf: (postId: string): SheetState => threadOf(postId).sheet,
    updateSheet(postId: string, fn: (s: SheetState) => SheetState, ticket?: LiveTicket): SheetState {
      if (ticket ? !writable(ticket) : gone.has(postId)) return threadOf(postId).sheet;
      const t = threadOf(postId);
      const sheet = fn(t.sheet);
      threads.set(postId, { ...t, sheet });
      emit();
      return sheet;
    },
    draftOf: (postId: string): CommentDraft => threadOf(postId).draft,
    setDraft(postId: string, patch: Partial<CommentDraft>) {
      const t = threadOf(postId);
      threads.set(postId, { ...t, draft: { ...t.draft, ...patch } });
      emit();
    },
    /**
     * La publication n'est plus lisible (404 d'une route de la publication) : ses commentaires, compteurs, brouillon et envois en attente
     * s'en vont, la feuille se ferme, et tout ce qui était en route avant (réponses, flammes) est jeté.
     */
    markGone(postId: string, ticket?: LiveTicket) {
      if (ticket && !(ticket.g === generation && ticket.p === pg(ticket.id))) return;
      postGen.set(postId, pg(postId) + 1);
      threads.delete(postId);
      entries.delete(postId);
      gone.add(postId);
      if (opening?.postId === postId) opening = null;
      emit();
    },
    isGone: (postId: string): boolean => gone.has(postId),
    /** Une lecture de la publication a réussi : elle est de nouveau lisible (jamais avant : rouvrir ne le dit pas). */
    clearGone(t: ReadTicket) {
      if (!this.fresh(t) || !gone.has(t.id)) return;
      gone.delete(t.id);
      emit();
    },
    opening: (): CommentsOpening | null => opening,
    /** Ouvre la feuille d'une publication (`focus` : le champ prend la main, bouton « Commenter »). */
    open(postId: string, focus: boolean) {
      opening = { postId, focus };
      emit();
    },
    close() {
      if (!opening) return;
      opening = null;
      emit();
    },
    /** Enregistre une instance de la ligne d'actions d'une publication ; rend l'arrêt. */
    register(postId: string, instance: string, focused = true) {
      hosts.set(postId, [...(hosts.get(postId) ?? []), { id: instance, focused }]);
      emit();
      return () => {
        const left = (hosts.get(postId) ?? []).filter((i) => i.id !== instance);
        if (left.length) hosts.set(postId, left);
        else hosts.delete(postId);
        emit();
      };
    },
    /** L'écran de cette instance est affiché (ou non) : la feuille passe à l'instance de l'écran visible. */
    setFocused(postId: string, instance: string, focused: boolean) {
      const list = hosts.get(postId);
      const found = list?.find((i) => i.id === instance);
      if (!list || !found || found.focused === focused) return;
      found.focused = focused;
      emit();
    },
    /** L'instance qui porte la feuille de cette publication : la première dont l'écran est affiché, sinon la première montée. */
    host: (postId: string): string | undefined => {
      const list = hosts.get(postId);
      return (list?.find((i) => i.focused) ?? list?.[0])?.id;
    },
    /** Tout oublier sans changer de compte (rarement utile ; `silent` : sans prévenir). */
    clear(silent = false) {
      reset();
      if (!silent) emit();
    },
  };
}
export type PostLiveStore = ReturnType<typeof createPostLiveStore>;

/**
 * Où est le curseur après une modification de la saisie (sans attendre l'événement de sélection, que le navigateur ne donne pas
 * toujours à la frappe) : à la fin de ce qui vient d'être écrit à l'endroit de la différence. Exact pour une frappe, un effacement
 * ou un collage en un seul endroit.
 */
export function caretAfterEdit(prev: string, next: string): number {
  let start = 0;
  const limit = Math.min(prev.length, next.length);
  while (start < limit && prev.charAt(start) === next.charAt(start)) start += 1;
  let endPrev = prev.length;
  let endNext = next.length;
  while (endPrev > start && endNext > start && prev.charAt(endPrev - 1) === next.charAt(endNext - 1)) {
    endPrev -= 1;
    endNext -= 1;
  }
  return endNext;
}
