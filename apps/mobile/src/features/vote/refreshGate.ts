// Rechargement groupé du vote en direct (lot 57, relecture) : une rafale de pointages ne doit pas faire une requête par
// message et par téléphone. `request()` lance le rechargement tout de suite s'il est permis ; sinon un seul rechargement
// reste en attente pour la fin de la fenêtre (le dernier est donc toujours garanti), et jamais deux chargements à la fois.

export type RefreshGate = {
  /** Demande un rechargement (regroupé). */
  request: () => void;
  /** Annule l'attente en cours (écran quitté). */
  dispose: () => void;
};

export function createRefreshGate(options: {
  run: () => Promise<unknown>;
  minMs: number;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}): RefreshGate {
  const now = options.now ?? Date.now;
  const setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let last: number | null = null;
  let running = false;
  let again = false;
  let timer: unknown = null;
  let disposed = false;

  const start = () => {
    timer = null;
    if (disposed) return;
    if (running) {
      again = true;
      return;
    }
    running = true;
    last = now();
    void Promise.resolve()
      .then(options.run)
      .catch(() => undefined)
      .finally(() => {
        running = false;
        if (again && !disposed) {
          again = false;
          request();
        }
      });
  };

  function request() {
    if (disposed) return;
    if (timer !== null) return;
    if (running) {
      again = true;
      return;
    }
    const wait = last === null ? 0 : Math.max(0, last + options.minMs - now());
    if (wait === 0) start();
    else timer = setTimer(start, wait);
  }

  return {
    request,
    dispose() {
      disposed = true;
      again = false;
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}
