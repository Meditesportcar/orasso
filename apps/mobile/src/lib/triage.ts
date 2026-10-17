// Tri par glissement (lot 23) : calculs purs, sans React Native (testés dans `triage.test.ts`). Aucune règle métier ici :
// capacité, liste d'attente, délais et verrouillage sont dans l'API, qui répond 409 quand une décision n'est plus
// possible. On calcule seulement ce qu'on affiche (étiquettes selon le glissement, file locale, décisions armées).
import type {
  ApplicationForTriage,
  EventCounters,
  RefusalReason,
  TriageDecision,
  triageAppLabels,
} from "@orasso/shared";

import type { DecideBody, TriageListQuery } from "./api/triage";

// --- Gestes -----------------------------------------------------------------------------------------------------

/** Distance du glissement, en part de la largeur de la carte, au-delà de laquelle le relâchement décide (§ 7.3). */
export const SWIPE_THRESHOLD_RATIO = 0.4;
/** Délai pendant lequel une décision reste annulable avant d'être envoyée à l'API (comme le site : lot 07). */
export const UNDO_DELAY_MS = 5_000;

/** Les trois sens de décision, en nombres : une fonction de worklet ne manipule que des nombres et des tableaux. */
export const DIR_ACCEPT = 0;
export const DIR_WAITLIST = 1;
export const DIR_REFUSE = 2;

/**
 * Progression (0 à 1) du glissement vers un sens de décision. Un seul sens à la fois est « tiré » : celui de l'axe
 * dominant. Droite = retenir, haut = liste d'attente, gauche = refuser ; vers le bas ne décide rien.
 * `'worklet'` : appelée par les styles animés (Reanimated 4), jamais de valeur capturée autre qu'un nombre.
 */
export function swipeProgress(dx: number, dy: number, threshold: number, dir: number): number {
  "worklet";
  if (threshold <= 0) return 0;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  let distance = 0;
  if (dir === 0) distance = horizontal && dx > 0 ? dx : 0;
  else if (dir === 2) distance = horizontal && dx < 0 ? -dx : 0;
  else distance = !horizontal && dy < 0 ? -dy : 0;
  const p = distance / threshold;
  return p > 1 ? 1 : p;
}

export type Swipe = {
  /** Le sens en cours de glissement (étiquette qui apparaît), `null` tant qu'on ne tire pas. */
  leaning: TriageDecision | null;
  /** 0 à 1 : l'étiquette apparaît avec la progression. */
  progress: number;
  /** Décision prise si on relâche maintenant (seuil atteint), sinon `null` : retour élastique. */
  decision: TriageDecision | null;
};

const DECISION_OF_DIR: Record<number, TriageDecision> = { 0: "accept", 1: "waitlist", 2: "refuse" };

/** État du glissement pour une translation (dx, dy) en pixels et une largeur de carte. */
export function swipeState(dx: number, dy: number, width: number): Swipe {
  const threshold = width * SWIPE_THRESHOLD_RATIO;
  let best = 0;
  let dir = -1;
  for (const d of [DIR_ACCEPT, DIR_WAITLIST, DIR_REFUSE]) {
    const p = swipeProgress(dx, dy, threshold, d);
    if (p > best) {
      best = p;
      dir = d;
    }
  }
  if (dir < 0) return { leaning: null, progress: 0, decision: null };
  const decision = DECISION_OF_DIR[dir] ?? null;
  return { leaning: decision, progress: best, decision: best >= 1 ? decision : null };
}

/** Rotation légère de la carte (degrés) selon la translation horizontale : 8° au seuil, bornée. */
export function swipeRotation(dx: number, width: number): number {
  "worklet";
  if (width <= 0) return 0;
  const r = (dx / (width * SWIPE_THRESHOLD_RATIO)) * 8;
  return r > 12 ? 12 : r < -12 ? -12 : r;
}

/** Où la carte part quand la décision est prise : hors écran dans le sens du geste (px, à partir de la largeur). */
export function exitTarget(decision: TriageDecision, width: number, height: number): { x: number; y: number } {
  if (decision === "accept") return { x: width * 1.3, y: 0 };
  if (decision === "refuse") return { x: -width * 1.3, y: 0 };
  return { x: 0, y: -height * 1.1 };
}

// --- Décisions armées et file locale ---------------------------------------------------------------------------

/** Ce qui accompagne une décision (motifs du refus, zone de la retenue). */
export type DecisionExtra = {
  reasons?: RefusalReason[];
  note?: string;
  sendReasons?: boolean;
  zoneId?: string | null;
};

export type Armed = {
  item: ApplicationForTriage;
  decision: TriageDecision;
  extra: DecisionExtra;
  /** Instant (ms) où la décision part à l'API si elle n'a pas été annulée. */
  dueAt: number;
  /** Envoi en cours : plus annulable. */
  sending: boolean;
};

export type Notice = { kind: "ok" | "error"; text: string };

export type QueueState = {
  /** À trier, dans l'ordre de l'API (la plus ancienne d'abord) : la première est la carte affichée. */
  queue: ApplicationForTriage[];
  /** Décisions armées ou en cours d'envoi, la plus ancienne d'abord. */
  armed: Armed[];
  /** Candidatures passées sans décider : elles retournent en fin de file. */
  skippedIds: string[];
  notice: Notice | null;
  /** Une décision a été refusée parce qu'elle avait déjà été prise ailleurs : recharger la file. */
  needsReload: boolean;
};

export const emptyQueue: QueueState = { queue: [], armed: [], skippedIds: [], notice: null, needsReload: false };

export type QueueAction =
  /** Nouvelles candidatures de l'API : celles déjà connues (file, armées) ne sont pas ajoutées deux fois. */
  | { type: "load"; items: ApplicationForTriage[] }
  | { type: "arm"; id: string; decision: TriageDecision; extra: DecisionExtra; now: number }
  | { type: "undo"; id: string }
  | { type: "sending"; id: string }
  | { type: "sent"; id: string; text: string }
  | { type: "failed"; id: string; failure: DecisionFailure; text: string }
  | { type: "skip"; id: string }
  /** Statut d'une candidature changé ailleurs (canal `triage`) : si elle n'est plus à trier, elle quitte la file. */
  | { type: "external"; id: string; status: string }
  | { type: "dismiss" };

export type DecisionFailure = "offline" | "full" | "elsewhere" | "locked" | "forbidden" | "other";

/** Classe l'erreur d'une décision (statut HTTP et code de l'API) : ce qu'on fait de la carte en découle. */
export function classifyDecisionError(status: number, code: string): DecisionFailure {
  if (status === 0) return "offline";
  if (code === "event_full") return "full";
  if (code === "locked") return "locked";
  // Décision déjà prise ailleurs (site, autre organisateur) ou candidature retirée entre-temps.
  if (code === "invalid_transition" || code === "not_found" || code === "conflict") return "elsewhere";
  if (status === 403) return "forbidden";
  return "other";
}

const known = (state: QueueState, id: string) =>
  state.queue.some((q) => q.id === id) || state.armed.some((a) => a.item.id === id);

export function queueReducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case "load": {
      const fresh = action.items.filter((i) => i.status === "pending" && !known(state, i.id));
      if (fresh.length === 0) return state.needsReload ? { ...state, needsReload: false } : state;
      // Les candidatures passées restent derrière les autres.
      const queue = [...state.queue, ...fresh];
      return { ...state, queue: orderSkippedLast(queue, state.skippedIds), needsReload: false };
    }
    case "arm": {
      const item = state.queue.find((q) => q.id === action.id);
      if (!item) return state;
      return {
        ...state,
        queue: state.queue.filter((q) => q.id !== action.id),
        armed: [
          ...state.armed,
          { item, decision: action.decision, extra: action.extra, dueAt: action.now + UNDO_DELAY_MS, sending: false },
        ],
        notice: null,
      };
    }
    case "undo": {
      const armed = state.armed.find((a) => a.item.id === action.id);
      // Une décision déjà partie ne s'annule plus ici (la décision reçue par l'API est définitive).
      if (!armed || armed.sending) return state;
      return {
        ...state,
        queue: [armed.item, ...state.queue],
        armed: state.armed.filter((a) => a.item.id !== action.id),
        skippedIds: state.skippedIds.filter((id) => id !== action.id),
        notice: null,
      };
    }
    case "sending":
      return { ...state, armed: state.armed.map((a) => (a.item.id === action.id ? { ...a, sending: true } : a)) };
    case "sent":
      return {
        ...state,
        armed: state.armed.filter((a) => a.item.id !== action.id),
        notice: { kind: "ok", text: action.text },
      };
    case "failed": {
      const armed = state.armed.find((a) => a.item.id === action.id);
      if (!armed) return state;
      const rest = state.armed.filter((a) => a.item.id !== action.id);
      const notice: Notice = { kind: "error", text: action.text };
      // Déjà décidée ailleurs : la carte n'a plus rien à faire dans la file, on recharge la vérité de l'API.
      if (action.failure === "elsewhere") return { ...state, armed: rest, notice, needsReload: true };
      // Sinon la carte revient en tête avec le message (plus de place, hors connexion, verrouillage…).
      return { ...state, armed: rest, queue: [armed.item, ...state.queue], notice };
    }
    case "skip": {
      const item = state.queue.find((q) => q.id === action.id);
      if (!item || state.queue.length < 2) return state;
      return {
        ...state,
        queue: [...state.queue.filter((q) => q.id !== action.id), item],
        skippedIds: [...state.skippedIds.filter((id) => id !== action.id), action.id],
      };
    }
    case "external":
      if (action.status === "pending" || !state.queue.some((q) => q.id === action.id)) return state;
      return { ...state, queue: state.queue.filter((q) => q.id !== action.id) };
    case "dismiss":
      return { ...state, notice: null };
  }
}

function orderSkippedLast(queue: ApplicationForTriage[], skipped: string[]): ApplicationForTriage[] {
  if (skipped.length === 0) return queue;
  return [...queue.filter((q) => !skipped.includes(q.id)), ...queue.filter((q) => skipped.includes(q.id))];
}

/** Les décisions armées dont le délai est écoulé et qui ne sont pas déjà parties. */
export const dueArmed = (state: QueueState, now: number): Armed[] =>
  state.armed.filter((a) => !a.sending && a.dueAt <= now);

/** Secondes restantes avant l'envoi (arrondi au-dessus : « 5 s » puis « 1 s », jamais « 0 s » avant l'envoi). */
export const secondsLeft = (armed: Pick<Armed, "dueAt">, now: number): number =>
  Math.max(Math.ceil((armed.dueAt - now) / 1000), 0);

/** La candidature affichée : la première de la file. */
export const currentOf = (state: QueueState): ApplicationForTriage | null => state.queue[0] ?? null;

/** La file est-elle presque vide (il faut en charger davantage) ? */
export const needsRefill = (state: QueueState, threshold = 4): boolean => state.queue.length < threshold;

/** Corps de la requête `decide` pour une décision armée. */
export function decideBody(decision: TriageDecision, extra: DecisionExtra): DecideBody {
  if (decision === "refuse") {
    return {
      decision,
      reasons: extra.reasons ?? [],
      note: extra.note?.trim() ? extra.note.trim() : undefined,
      sendReasons: extra.sendReasons ?? true,
    };
  }
  return { decision, sendReasons: true, ...(decision === "accept" && extra.zoneId ? { zoneId: extra.zoneId } : {}) };
}

/** Message de validation d'un refus (aucune règle métier : celles de `decideSchema`, dites avant l'envoi). */
export function refusalProblem(
  reasons: readonly RefusalReason[],
  note: string,
  labels: Pick<typeof triageAppLabels, "refusalNeedReason" | "refusalNeedNote">,
): string | null {
  if (reasons.length === 0) return labels.refusalNeedReason;
  if (reasons.includes("other") && !note.trim()) return labels.refusalNeedNote;
  return null;
}

// --- Compteurs --------------------------------------------------------------------------------------------------

export type CounterCell = { value: number | string; label: string };

/** Les cinq compteurs de l'écran de tri (prototype) : restantes, retenus, à trier (actif), attente, refusés. */
export function counterCells(c: EventCounters | null, labels: typeof triageAppLabels): CounterCell[] {
  const v = (n: number | undefined) => (n === undefined ? "–" : n);
  return [
    { value: c ? (c.remaining === null ? labels.unlimited : c.remaining) : "–", label: labels.counterRemaining },
    { value: v(c?.accepted), label: labels.counterAccepted },
    { value: v(c?.pending), label: labels.counterPending },
    { value: v(c?.waitlisted), label: labels.counterWaitlisted },
    { value: v(c?.refused), label: labels.counterRefused },
  ];
}

export const COUNTER_ACTIVE = 2;

// --- Liste d'attente : réordonner -------------------------------------------------------------------------------

/** Déplace un élément (copie). Hors bornes : la liste est rendue telle quelle. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return next;
  const [item] = next.splice(from, 1);
  if (item !== undefined) next.splice(to, 0, item);
  return next;
}

/**
 * Nouvelle place d'une ligne tirée de `dy` pixels : on franchit une ligne voisine quand le centre de la ligne tirée
 * dépasse le milieu de celle-ci. Les hauteurs varient (un nom de véhicule ne se tronque jamais).
 */
export function dragTargetIndex(heights: readonly number[], from: number, dy: number): number {
  if (from < 0 || from >= heights.length) return from;
  const own = heights[from] ?? 0;
  let target = from;
  let boundary = own / 2;
  if (dy > 0) {
    for (let i = from + 1; i < heights.length; i++) {
      const h = heights[i] ?? 0;
      if (dy > boundary + h / 2) {
        target = i;
        boundary += h;
      } else break;
    }
  } else if (dy < 0) {
    for (let i = from - 1; i >= 0; i--) {
      const h = heights[i] ?? 0;
      if (-dy > boundary + h / 2) {
        target = i;
        boundary += h;
      } else break;
    }
  }
  return target;
}

/** Ordre envoyé à l'API après un changement : toutes les candidatures de la liste, une fois chacune. */
export const waitlistIds = (rows: readonly Pick<ApplicationForTriage, "id">[]): string[] => rows.map((r) => r.id);

// --- Mode liste -------------------------------------------------------------------------------------------------

export type ListFilters = {
  status: string;
  categoryId: string;
  makeId: string;
  country: string;
  yearFrom: string;
  yearTo: string;
  grade: string;
  crewId: string;
  /** Lot 34 : un jour (id), `whole` (tout l'événement) ou vide (tous les jours), comme le filtre « Jour » du site. */
  dayId: string;
  q: string;
};

export const emptyFilters: ListFilters = {
  status: "pending",
  categoryId: "",
  makeId: "",
  country: "",
  yearFrom: "",
  yearTo: "",
  grade: "",
  crewId: "",
  dayId: "",
  q: "",
};

const toYear = (s: string): number | undefined => {
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n >= 1900 && n <= 2100 ? n : undefined;
};

/** Filtres de l'écran → paramètres de `GET /events/:id/applications` (les vides sont omis). */
export function listQuery(
  filters: ListFilters,
  kind: TriageListQuery["kind"],
  cursor: string | null = null,
): TriageListQuery {
  return {
    kind,
    status: (filters.status || undefined) as TriageListQuery["status"],
    sort: "created_at",
    categoryId: filters.categoryId || undefined,
    makeId: filters.makeId || undefined,
    country: filters.country || undefined,
    yearFrom: toYear(filters.yearFrom),
    yearTo: toYear(filters.yearTo),
    grade: filters.grade || undefined,
    crewId: filters.crewId || undefined,
    dayId: filters.dayId || undefined,
    q: filters.q.trim() || undefined,
    cursor,
    limit: 30,
  };
}

/** Nombre de filtres posés en plus du statut (pastille du bouton « Filtrer »). */
export const activeFilterCount = (f: ListFilters): number =>
  [
    f.categoryId,
    f.makeId,
    f.country,
    toYear(f.yearFrom),
    toYear(f.yearTo),
    f.grade,
    f.crewId,
    f.dayId,
    f.q.trim(),
  ].filter(Boolean).length;

export const toggleId = (selected: readonly string[], id: string): string[] =>
  selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];

/** Résultats d'une décision en masse : combien ont réussi, combien ont été refusées par l'API (motifs distincts). */
export function bulkOutcome(results: readonly { id: string; ok: boolean; error?: string }[]) {
  const failed = results.filter((r) => !r.ok);
  return {
    ok: results.length - failed.length,
    failed: failed.length,
    failedIds: failed.map((r) => r.id),
    errors: [...new Set(failed.map((f) => f.error ?? "internal"))],
  };
}

// --- Choix de l'événement ---------------------------------------------------------------------------------------

/** Les événements triables : publiés et pas encore passés (le plus proche d'abord). */
export function triageEvents<E extends { id: string; status: string; startsAt: string; endsAt: string }>(
  events: readonly E[],
  at: Date,
): E[] {
  const t = at.getTime();
  return events
    .filter((e) => e.status === "published" && Date.parse(e.endsAt) > t)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
}
