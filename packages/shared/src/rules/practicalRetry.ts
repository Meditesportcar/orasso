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
