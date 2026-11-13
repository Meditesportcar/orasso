// Lot R8q, tour 3 : relances de « Pratique ». Seule une erreur réseau (statut 0) est relancée ; un refus (403 d'un compte suspendu, 404,
// 429) ne l'est jamais. Les relances sont espacées (15 s, 30 s, 60 s, puis toutes les 2 minutes) et n'ont lieu que sur l'écran affiché,
// l'appli au premier plan : l'écran ne se met pas lui-même en 429. Une seule minuterie par usage : en programmer une nouvelle annule
// la précédente, et l'annuler au démontage les arrête toutes.
export const PRACTICAL_RETRY_DELAYS_MS = [15_000, 30_000, 60_000, 120_000] as const;
/** Écart minimal entre deux lectures d'un même écran, quelle qu'en soit la cause (retour au premier plan compris). */
export const PRACTICAL_MIN_GAP_MS = 15_000;

/** Délai avant la relance numéro `attempt` (0 pour la première) : 15 s, 30 s, 60 s, puis 2 minutes. */
export function practicalRetryDelay(attempt: number): number {
  const last = PRACTICAL_RETRY_DELAYS_MS.length - 1;
  return PRACTICAL_RETRY_DELAYS_MS[Math.min(Math.max(0, Math.floor(attempt)), last)] as number;
}

/** Faut-il relancer ? Erreur réseau seulement, écran affiché et appli au premier plan. */
export function shouldRetryPractical(input: { network: boolean; focused: boolean; foreground: boolean }): boolean {
  return input.network && input.focused && input.foreground;
}

/** Une lecture est-elle permise maintenant ? Jamais deux lectures à moins de `PRACTICAL_MIN_GAP_MS` l'une de l'autre. */
export function practicalReadAllowed(lastStartedAt: number, now: number): boolean {
  return lastStartedAt === 0 || now - lastStartedAt >= PRACTICAL_MIN_GAP_MS;
}

type Handle = unknown;

/** Une seule minuterie : `schedule` annule la précédente, `cancel` l'arrête. */
export function createSingleTimer(
  set: (fn: () => void, ms: number) => Handle = (fn, ms) => setTimeout(fn, ms),
  clear: (handle: Handle) => void = (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
) {
  let handle: Handle | null = null;
  return {
    schedule(fn: () => void, ms: number) {
      if (handle !== null) clear(handle);
      handle = set(() => {
        handle = null;
        fn();
      }, ms);
    },
    cancel() {
      if (handle !== null) clear(handle);
      handle = null;
    },
    pending: () => handle !== null,
  };
}

/**
 * Suivi de « Ma météo » (tour 4) : une tentative par lieu de la météo pour toute la séance, remise à zéro à chaque changement de compte.
 * `echo` : un geste dans « Pratique » vient de donner sa case à la météo : le lieu qui en résulte n'est pas repris (déjà connu ici).
 */
export function createFollowTracker(now: () => number = Date.now, echoMs = 10_000) {
  let followed: string | null = null;
  let echoUntil = 0;
  return {
    shouldFollow(key: string | null): boolean {
      if (!key) {
        followed = null;
        return false;
      }
      if (followed === key) return false;
      followed = key;
      return now() >= echoUntil;
    },
    echo() {
      echoUntil = now() + echoMs;
    },
    reset() {
      followed = null;
      echoUntil = 0;
    },
  };
}

/** La clé de suivi de la météo : sa case arrondie (0,1°), jamais le libellé ni l'heure de la prévision. */
export function weatherFollowKey(coarse: { lat: number; lng: number } | null): string | null {
  return coarse ? `${coarse.lat.toFixed(1)},${coarse.lng.toFixed(1)}` : null;
}

/** Relectures tant que la réponse annonce des chargements en cours : 3 s, 6 s, 12 s, 24 s, puis arrêt (`null`). */
export const PRACTICAL_PENDING_DELAYS_MS = [3_000, 6_000, 12_000, 24_000] as const;
export function practicalPendingDelay(attempt: number): number | null {
  return PRACTICAL_PENDING_DELAYS_MS[Math.max(0, Math.floor(attempt))] ?? null;
}

/**
 * Une lecture à la fois, sans en perdre : une demande qui arrive pendant une lecture en cours est mise en attente (une seule) ; à la
 * fin de la lecture, `leave` dit s'il faut en relancer une (changement de compte pendant la requête : la lecture du nouveau compte
 * part dès que la précédente est terminée).
 */
export function createReadGate() {
  let busy = false;
  let queued = false;
  return {
    /** `true` : la lecture peut partir. `false` : une lecture est en cours, celle-ci est mise en attente. */
    enter(): boolean {
      if (busy) {
        queued = true;
        return false;
      }
      busy = true;
      return true;
    },
    /** La lecture est terminée : `true` si une demande attendait (il faut relire). */
    leave(): boolean {
      busy = false;
      const rerun = queued;
      queued = false;
      return rerun;
    },
  };
}

/** Ce qu'une lecture a donné, pour décider de la suite. */
export type PracticalReadOutcome = "complete" | "partial" | "transient" | "refused";

/** Une réponse relue au plus toutes les 60 s au retour sur l'écran (et un refus, seulement après ce délai). */
export const PRACTICAL_STALE_MS = 60_000;

/** L'issue d'une lecture en échec : réseau (statut 0) ou 5xx (502 pendant un déploiement) = transitoire ; tout 4xx (403, 429…) = refus. */
export function practicalFailureOutcome(status: number): "transient" | "refused" {
  return status === 0 || status >= 500 ? "transient" : "refused";
}

/**
 * Un refus (4xx) n'est relu qu'au retour sur l'écran (onglet visible, appli au premier plan, retour en ligne), seulement après
 * `PRACTICAL_STALE_MS` et si `practicalReadAllowed` le permet ; jamais par une minuterie.
 */
export function practicalRefusedReadAllowed(refusedAt: number, lastStartedAt: number, now: number): boolean {
  return refusedAt > 0 && now - refusedAt >= PRACTICAL_STALE_MS && practicalReadAllowed(lastStartedAt, now);
}

/**
 * La suite d'une lecture de « Pratique », trois issues : **transitoire** (réseau ou 5xx) : relance espacée (15 s, 30 s, 60 s, 2 min) ou
 * poursuite du calendrier s'il est commencé ; **refus** (4xx) : aucune minuterie (voir `practicalRefusedReadAllowed`) ; **complète** :
 * calendrier (`calendarStep`, 3/6/12/24 s tant que des chargements sont en cours) et compteur de relances (`networkAttempt`) à 0. Une
 * réponse partielle avance le calendrier. `delay: null` : rien à relancer.
 */
export function nextPracticalRead(
  outcome: PracticalReadOutcome,
  calendarStep: number,
  networkAttempt: number,
): { delay: number | null; calendarStep: number; networkAttempt: number } {
  if (outcome === "complete") return { delay: null, calendarStep: 0, networkAttempt: 0 };
  if (outcome === "refused") return { delay: null, calendarStep, networkAttempt };
  const pending = outcome === "partial" || calendarStep > 0 ? practicalPendingDelay(calendarStep) : null;
  if (pending !== null) {
    return {
      delay: pending,
      calendarStep: calendarStep + 1,
      networkAttempt: outcome === "partial" ? 0 : networkAttempt,
    };
  }
  if (outcome === "transient" && calendarStep === 0) {
    return { delay: practicalRetryDelay(networkAttempt), calendarStep, networkAttempt: networkAttempt + 1 };
  }
  return { delay: null, calendarStep, networkAttempt };
}
