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

export const crewChannel = (crewId: string) => `crew:${crewId}`;

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
  /** La page elle-même : en-tête, onglets Sorties, Garage et Membres. */
  page: boolean;
  /** Reconnexion ou relecture de secours : des signaux ont pu se perdre, tout ce qui est ouvert se relit. */
  full: boolean;
};

export const emptyCrewLiveNeeds = (): CrewLiveNeeds => ({
  head: false,
  posts: [],
  removedPosts: [],
  comments: [],
  removedComments: [],
  page: false,
  full: false,
});

/** Reconnexion, retour de l'arrière-plan, relecture de secours : la première page du fil et la page. */
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
    case "outing.updated":
    case "outing.cancelled":
    case "outing.rsvp":
    case "member.joined":
    case "member.left":
      needs.head = true;
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
  for (const k of ["posts", "removedPosts", "comments", "removedComments"] as const) {
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

/**
 * Signaux groupés : la première part tout de suite, les suivantes attendent la fin de la seconde en cours. Une seule
 * relecture à la fois : ce qui arrive pendant une relecture part à la suivante.
 */
export function createCrewLiveBatcher(
  run: (needs: CrewLiveNeeds) => Promise<void> | void,
  intervalMs = CREW_LIVE_MIN_INTERVAL_MS,
): CrewLiveBatcher {
  let pending: CrewLiveNeeds | null = null;
  let last = Number.NEGATIVE_INFINITY;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let disposed = false;

  const flush = async () => {
    timer = null;
    if (disposed || !pending) return;
    if (running) return schedule();
    const needs = pending;
    pending = null;
    running = true;
    last = Date.now();
    try {
      await run(needs);
    } catch {
      // La relecture a échoué : la prochaine relecture (signal, reconnexion) rattrapera.
    } finally {
      running = false;
      if (pending) schedule();
    }
  };
  const schedule = () => {
    if (timer || disposed) return;
    timer = setTimeout(() => void flush(), Math.max(0, last + intervalMs - Date.now()));
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

/**
 * Fusionne la première page relue (`head`, autorité pour sa période) avec le fil affiché :
 * - les entrées de `head` déjà affichées sont remplacées (nombres à jour) ;
 * - une entrée affichée dans la période de `head` mais absente de `head` a disparu (publication retirée, sortie
 *   annulée, membre parti) ;
 * - les entrées plus anciennes (pages suivantes déjà chargées) restent telles quelles ;
 * - les nouvelles entrées sont insérées en haut si `insert`, sinon tenues de côté (`fresh`) pour la pastille : la liste
 *   ne saute pas sous le doigt.
 * `complete` : `head` est le fil entier (pas de page suivante).
 */
export function mergeCrewFeedHead<T extends Keyed>(
  current: readonly T[],
  head: readonly T[],
  opts: { complete: boolean; insert: boolean },
): { items: T[]; fresh: T[] } {
  const headKeys = new Set(head.map((i) => i.key));
  const last = head.at(-1);
  const inPeriod = (i: T) => opts.complete || headKeys.has(i.key) || (last !== undefined && i.at > last.at);
  const known = new Set(current.map((i) => i.key));
  const fresh = head.filter((i) => !known.has(i.key));
  const shown = opts.insert ? head : head.filter((i) => known.has(i.key));
  const older = current.filter((i) => !inPeriod(i));
  return { items: [...shown, ...older], fresh: opts.insert ? [] : fresh };
}

/** Texte de la pastille : « 1 nouvelle publication », « 3 nouvelles publications », ou une arrivée, une sortie. */
export function crewLivePillLabel(fresh: readonly { type: string }[]): string | null {
  if (!fresh.length) return null;
  const posts = fresh.filter((i) => i.type === "post").length;
  if (posts === 0) return "Du nouveau dans le fil";
  return posts > 1 ? `${posts} nouvelles publications` : "1 nouvelle publication";
}
