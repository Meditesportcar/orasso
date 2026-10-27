// La page du crew en direct (lot R6a, retour de Damien du 27/10). Le canal temps réel `crew:<id>` ne porte qu'un signal
// minimal, sans contenu : `{ type, crewId, postId?, commentId?, outingId? }`. La page relit ce qui a changé par les
// routes habituelles, qui appliquent les droits de chaque personne (aucune donnée ne passe par le canal). Règles
// communes à l'appli et au site : ce qu'un signal fait relire, le regroupement (une relecture par seconde au plus) et
// la fusion de la première page relue avec le fil affiché.

export const crewSignalTypes = [
  "post.created",
  "post.removed",
  "post.fire",
  "comment.created",
  "comment.removed",
  "poll.voted",
  "poll.closed",
  "outing.created",
  "outing.updated",
  "outing.cancelled",
  "outing.rsvp",
  "member.joined",
  "member.left",
  "crew.updated",
] as const;
export type CrewSignalType = (typeof crewSignalTypes)[number];

/** Le signal, tel qu'il passe sur le canal : jamais de texte, de pseudo, de photo ni de nombre. */
export type CrewSignal = {
  type: CrewSignalType;
  crewId: string;
  postId?: string;
  commentId?: string;
  outingId?: string;
};

/** Au plus une relecture par seconde, quel que soit le nombre de signaux. */
export const CREW_LIVE_MIN_INTERVAL_MS = 1_000;
/** Site sans WebSocket (proxy, réseau d'entreprise) : relecture toutes les 20 s, onglet visible. */
export const CREW_LIVE_POLL_MS = 20_000;
/** Tour 2 : une relecture en échec est retentée après 2 s, 4 s, 8 s… jusqu'à 30 s entre deux essais. */
export const CREW_LIVE_RETRY_MAX_MS = 30_000;
/**
 * Tour 2 : pages relues au plus d'un coup (fil : 20 par page ; commentaires : 50 par page). Au-delà, la liste garde le
 * vrai curseur (« Voir la suite ») : jamais de troncature silencieuse.
 */
export const CREW_LIVE_MAX_PAGES = 20;

/** Préfixe des canaux des crews (un compte suspendu ou supprimé en est retiré tout de suite, tour 2). */
export const CREW_CHANNEL_PREFIX = "crew:";
export const crewChannel = (crewId: string) => `${CREW_CHANNEL_PREFIX}${crewId}`;

const ID = /^[0-9a-f-]{36}$/;
const optionalId = (v: unknown): string | undefined => (typeof v === "string" && ID.test(v) ? v : undefined);

/** Un message du canal lu comme un signal du crew attendu ; tout le reste est ignoré. */
export function parseCrewSignal(type: string, payload: unknown, crewId: string): CrewSignal | null {
  if (!(crewSignalTypes as readonly string[]).includes(type)) return null;
  const p = (payload ?? {}) as Record<string, unknown>;
  if (p.type !== type || p.crewId !== crewId) return null;
  const signal: CrewSignal = { type: type as CrewSignalType, crewId };
  const postId = optionalId(p.postId);
  const commentId = optionalId(p.commentId);
  const outingId = optionalId(p.outingId);
  if (postId) signal.postId = postId;
  if (commentId) signal.commentId = commentId;
  if (outingId) signal.outingId = outingId;
  return signal;
}

/** Ce que la page relit, pour un lot de signaux regroupés. */
export type CrewLiveNeeds = {
  /** La première page du fil (nouvelles entrées, sorties, arrivées et départs). */
  head: boolean;
  /** Publications à relire une à une (flamme, commentaires, sondage). */
  posts: string[];
  /** Publications retirées : elles disparaissent sans relecture. */
  removedPosts: string[];
  /** Publications dont la feuille des commentaires, si elle est ouverte, se relit. */
  comments: string[];
  /** Commentaires retirés : ils disparaissent de la feuille. */
  removedComments: string[];
  /** Tour 2 : sorties dont la carte du fil se relit (modifiée, réponse), où qu'elle soit dans le fil. */
  outings: string[];
  /** Tour 2 : sorties annulées : leur carte quitte le fil. */
  removedOutings: string[];
  /** La page elle-même : en-tête, onglets Sorties, Garage et Membres. */
  page: boolean;
  /**
   * Reconnexion ou relecture de secours : des signaux ont pu se perdre, tout ce qui est affiché se relit (toutes les
   * pages chargées du fil, pas seulement la première).
   */
  full: boolean;
};

const LISTS = ["posts", "removedPosts", "comments", "removedComments", "outings", "removedOutings"] as const;

export const emptyCrewLiveNeeds = (): CrewLiveNeeds => ({
  head: false,
  posts: [],
  removedPosts: [],
  comments: [],
  removedComments: [],
  outings: [],
  removedOutings: [],
  page: false,
  full: false,
});

/** Reconnexion, retour de l'arrière-plan, relecture de secours : tout le fil affiché et la page. */
export const fullCrewLiveNeeds = (): CrewLiveNeeds => ({ ...emptyCrewLiveNeeds(), head: true, page: true, full: true });

function add(list: string[], id: string | undefined) {
  if (id && !list.includes(id)) list.push(id);
}

/** Ajoute à `needs` ce que demande un signal. */
export function addCrewSignal(needs: CrewLiveNeeds, s: CrewSignal): CrewLiveNeeds {
  switch (s.type) {
    case "post.created":
      needs.head = true;
      break;
    case "post.removed":
      add(needs.removedPosts, s.postId);
      break;
    case "post.fire":
    case "poll.voted":
    case "poll.closed":
      add(needs.posts, s.postId);
      break;
    case "comment.created":
      add(needs.posts, s.postId);
      add(needs.comments, s.postId);
      break;
    case "comment.removed":
      add(needs.posts, s.postId);
      add(needs.removedComments, s.commentId);
      break;
    case "outing.created":
    case "member.joined":
    case "member.left":
      needs.head = true;
      needs.page = true;
      break;
    // Tour 2 : la carte de la sortie, où qu'elle soit dans le fil, se relit ou part (l'identifiant suit jusqu'au client).
    case "outing.updated":
    case "outing.rsvp":
      if (s.outingId) add(needs.outings, s.outingId);
      else needs.head = true;
      needs.page = true;
      break;
    case "outing.cancelled":
      if (s.outingId) add(needs.removedOutings, s.outingId);
      else needs.head = true;
      needs.page = true;
      break;
    case "crew.updated":
      needs.page = true;
      break;
  }
  return needs;
}

function mergeNeeds(a: CrewLiveNeeds, b: CrewLiveNeeds): CrewLiveNeeds {
  const out = { ...a, head: a.head || b.head, page: a.page || b.page, full: a.full || b.full };
  for (const k of LISTS) {
    out[k] = [...a[k]];
    for (const id of b[k]) add(out[k], id);
  }
  return out;
}

export type CrewLiveBatcher = {
  /** Un signal du canal, ou `"all"` (reconnexion, relecture de secours). */
  push(signal: CrewSignal | "all"): void;
  dispose(): void;
};

/** Tour 2 : délai avant le n-ième nouvel essai d'une relecture en échec (2 s, 4 s, 8 s… 30 s au plus). */
export const crewLiveRetryDelay = (failures: number) => Math.min(CREW_LIVE_RETRY_MAX_MS, 1_000 * 2 ** failures);

/**
 * Signaux groupés : la première part tout de suite, les suivantes attendent la fin de la seconde en cours. Une seule
 * relecture à la fois : ce qui arrive pendant une relecture attend sa fin (tour 2 : aucun minuteur ne tourne à vide
 * pendant une relecture lente). Une relecture en échec garde son besoin, qui repart après un délai croissant ;
 * `onStale(true)` le dit à l'écran (état discret), `onStale(false)` au premier succès.
 */
export function createCrewLiveBatcher(
  run: (needs: CrewLiveNeeds) => Promise<void> | void,
  opts: { intervalMs?: number; onStale?: (stale: boolean) => void } = {},
): CrewLiveBatcher {
  const intervalMs = opts.intervalMs ?? CREW_LIVE_MIN_INTERVAL_MS;
  let pending: CrewLiveNeeds | null = null;
  let last = Number.NEGATIVE_INFINITY;
  let retryAt = 0;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let disposed = false;

  const flush = async () => {
    timer = null;
    if (disposed || running || !pending) return;
    const needs = pending;
    pending = null;
    running = true;
    last = Date.now();
    let failed = false;
    try {
      await run(needs);
    } catch {
      failed = true;
    }
    running = false;
    if (disposed) return;
    if (failed) {
      // Le besoin reste jusqu'au succès : il repart avec ce qui est arrivé entre-temps, après le délai.
      pending = pending ? mergeNeeds(needs, pending) : needs;
      failures += 1;
      retryAt = Date.now() + crewLiveRetryDelay(failures);
      if (failures === 1) opts.onStale?.(true);
    } else if (failures) {
      failures = 0;
      retryAt = 0;
      opts.onStale?.(false);
    }
    if (pending) schedule();
  };
  const schedule = () => {
    if (timer || disposed || running) return;
    const at = Math.max(last + intervalMs, retryAt);
    timer = setTimeout(() => void flush(), Math.max(0, at - Date.now()));
  };
  return {
    push(signal) {
      if (disposed) return;
      const next = signal === "all" ? fullCrewLiveNeeds() : addCrewSignal(emptyCrewLiveNeeds(), signal);
      pending = pending ? mergeNeeds(pending, next) : next;
      schedule();
    },
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
      timer = null;
      pending = null;
    },
  };
}

/** Une entrée du fil, vue par la fusion : sa clé et sa date (ISO, triée du plus récent au plus ancien). */
type Keyed = { key: string; at: string };

/** Une page lue par curseur (fil, commentaires). */
type PageOf<T> = { items: T[]; nextCursor: string | null };

/** Le fil relu depuis le haut, sur une ou plusieurs pages. */
export type CrewFeedRead<T> = {
  items: T[];
  /** Le curseur après la dernière page lue (`null` : le fil entier est lu). */
  nextCursor: string | null;
  /** La lecture s'est arrêtée à `CREW_LIVE_MAX_PAGES` sans rejoindre le fil affiché : elle le remplace. */
  capped: boolean;
};

/** Le fil tel que l'écran le tient : ce qui est affiché, le curseur de « Voir la suite », les nouveautés en attente. */
export type CrewFeedState<T> = { items: T[]; cursor: string | null; pending: T[] };

/**
 * Tour 2 : relit le fil depuis le haut, page après page, jusqu'à rejoindre ce qui est affiché :
 * - `head` (un signal) : jusqu'à retrouver une entrée affichée (après une coupure, plus de 20 nouveautés : les pages
 *   intermédiaires sont lues) ;
 * - `full` (reconnexion, relecture de secours) : jusqu'à couvrir la plus ancienne entrée affichée (toutes les pages
 *   chargées sont revalidées : retraits, votes, nombres).
 * Un échec de page rejette tout (rien de partiel n'est appliqué).
 */
export async function readCrewFeedTop<T extends Keyed>(
  fetchPage: (cursor: string | null) => Promise<PageOf<T>>,
  shown: readonly T[],
  mode: "head" | "full",
  maxPages = CREW_LIVE_MAX_PAGES,
): Promise<CrewFeedRead<T>> {
  const known = new Set(shown.map((i) => i.key));
  const newest = shown[0];
  const oldest = shown.at(-1);
  const enough = (items: readonly T[]) => {
    const last = items.at(-1);
    if (!newest || !oldest || !last) return true;
    if (mode === "full") return items.some((i) => i.key === oldest.key) || last.at < oldest.at;
    return items.some((i) => known.has(i.key)) || last.at < newest.at;
  };
  const items: T[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  for (let pages = 0; ; ) {
    const page: PageOf<T> = await fetchPage(cursor);
    pages += 1;
    for (const i of page.items) {
      if (seen.has(i.key)) continue;
      seen.add(i.key);
      items.push(i);
    }
    cursor = page.nextCursor;
    if (!cursor || enough(items)) return { items, nextCursor: cursor, capped: false };
    if (pages >= maxPages) return { items, nextCursor: cursor, capped: true };
  }
}

/**
 * Applique une lecture du haut du fil (autorité pour sa période) au fil affiché :
 * - les entrées relues remplacent les affichées (nombres, votes à jour) ;
 * - une entrée affichée dans la période relue mais absente a disparu (publication retirée, sortie annulée…) ;
 * - les entrées plus anciennes (pages suivantes déjà chargées) restent, et le curseur de « Voir la suite » aussi ; si
 *   la lecture couvre tout l'affiché (ou l'a remplacé, `capped`), son curseur prend la suite ;
 * - tour 2 (pastille juste) : seules les entrées **plus récentes que la plus récente affichée** sont des nouveautés ;
 *   une entrée plus ancienne qui remonte s'insère à sa place, sans pastille. En haut du fil (`insert`), les nouveautés
 *   s'insèrent ; plus bas, elles attendent (`pending`) : la liste ne saute pas sous le doigt. Les siennes (`mine`)
 *   s'insèrent toujours : l'écran qui a fait le geste ne se signale rien.
 */
export function applyCrewFeedRead<T extends Keyed>(
  state: { items: readonly T[]; cursor: string | null },
  read: CrewFeedRead<T>,
  opts: { insert: boolean; mine?: (item: T) => boolean },
): CrewFeedState<T> {
  const head = read.items;
  const complete = read.nextCursor === null;
  const headKeys = new Set(head.map((i) => i.key));
  const last = head.at(-1);
  const inPeriod = (i: T) => complete || headKeys.has(i.key) || (last !== undefined && i.at > last.at);
  const older = read.capped ? [] : state.items.filter((i) => !inPeriod(i));
  const known = new Set(state.items.map((i) => i.key));
  const newest = state.items[0]?.at;
  const pending = opts.insert
    ? []
    : head.filter((i) => !known.has(i.key) && (newest === undefined || i.at > newest) && !opts.mine?.(i));
  const held = new Set(pending.map((i) => i.key));
  return {
    items: [...head.filter((i) => !held.has(i.key)), ...older],
    cursor: older.length ? state.cursor : read.nextCursor,
    pending,
  };
}

/** La pastille touchée : les nouveautés en attente s'affichent à leur place (en haut). */
export function acceptCrewFeedPending<T extends Keyed>(items: readonly T[], pending: readonly T[]): T[] {
  const known = new Set(items.map((i) => i.key));
  return [...pending.filter((i) => !known.has(i.key)), ...items].sort((a, b) =>
    a.at < b.at ? 1 : a.at > b.at ? -1 : 0,
  );
}

/**
 * Tour 2 : relit les commentaires d'une publication (du plus ancien au plus récent, 50 par page) jusqu'à couvrir ce qui
 * est affiché : toute la liste si elle était complète (les nouveaux sont à la fin), sinon jusqu'au dernier affiché. Un
 * échec de page rejette tout (la liste précédente reste) ; au-delà de `maxPages`, le vrai curseur est gardé.
 */
export async function readCrewComments<T extends { id: string; createdAt: string }>(
  fetchPage: (cursor: string | null) => Promise<PageOf<T>>,
  shown: { items: readonly T[]; cursor: string | null },
  maxPages = CREW_LIVE_MAX_PAGES,
): Promise<{ items: T[]; cursor: string | null }> {
  const complete = shown.cursor === null;
  const lastShown = shown.items.at(-1);
  const enough = (items: readonly T[]) => {
    if (complete) return false;
    const last = items.at(-1);
    if (!lastShown || !last) return true;
    return items.some((i) => i.id === lastShown.id) || last.createdAt > lastShown.createdAt;
  };
  const byId = new Map<string, T>();
  let cursor: string | null = null;
  for (let pages = 0; ; ) {
    const page: PageOf<T> = await fetchPage(cursor);
    pages += 1;
    for (const c of page.items) byId.set(c.id, c);
    cursor = page.nextCursor;
    const items = [...byId.values()];
    if (!cursor || enough(items) || pages >= maxPages) {
      return {
        items: items.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),
        cursor,
      };
    }
  }
}

/** Texte de la pastille : « 1 nouvelle publication », « 3 nouvelles publications », ou une arrivée, une sortie. */
export function crewLivePillLabel(fresh: readonly { type: string }[]): string | null {
  if (!fresh.length) return null;
  const posts = fresh.filter((i) => i.type === "post").length;
  if (posts === 0) return "Du nouveau dans le fil";
  return posts > 1 ? `${posts} nouvelles publications` : "1 nouvelle publication";
}
