// Minuteur jusqu'à une heure donnée (lot R7d2, tour 3), commun à l'appli et au site. Un minuteur ne dépasse pas ~24 jours
// (2^31 ms) : une échéance plus lointaine est atteinte par étapes, en réarmant jusqu'à l'échéance. L'heure est lue par
// `nowMs` (heure du serveur estimée côté appli), jamais par l'heure brute de l'appareil.

/** Plus long délai d'une étape (en deçà du plafond de `setTimeout`). */
export const MAX_TIMER_MS = 2 ** 30;
/** Marge après l'échéance, pour ne pas se réveiller une milliseconde trop tôt. */
const MARGIN_MS = 50;

export type TimerApi = {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
};

/** Appelle `fire` une fois, à `targetMs` (échéance ou plus tard). Renvoie l'annulation. */
export function scheduleAt(
  targetMs: number,
  nowMs: () => number,
  fire: () => void,
  timers: TimerApi = { set: (fn, ms) => setTimeout(fn, ms), clear: (h) => clearTimeout(h as never) },
): () => void {
  let handle: unknown;
  let cancelled = false;
  const arm = () => {
    const wait = targetMs - nowMs();
    if (!(wait > 0)) {
      fire();
      return;
    }
    handle = timers.set(
      () => {
        if (cancelled) return;
        if (targetMs - nowMs() > 0 && wait + MARGIN_MS > MAX_TIMER_MS) arm();
        else fire();
      },
      Math.min(wait + MARGIN_MS, MAX_TIMER_MS),
    );
  };
  arm();
  return () => {
    cancelled = true;
    timers.clear(handle);
  };
}
