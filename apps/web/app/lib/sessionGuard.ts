// Petit lot site (P24) : la garde de compte des écritures différées (cloche d'un événement, fin de candidature). Pure (aucun
// React) pour être testée : le compte de référence est celui de la PAGE (`userId` du chargeur), pas la première annonce reçue.

export type Listen = (listener: (userId: string | null) => void) => () => void;

export type SessionGuard = {
  /** Vrai tant que le dernier compte annoncé est celui de la page (une annonce de A après B rend l'accord). */
  alive: () => boolean;
  /** Un écrivain dont les écritures en cours retiennent l'écoute après le démontage. */
  watch: (writer: { whenIdle: () => Promise<boolean> }) => void;
  /** Commence l'écoute ; rend l'arrêt, à appeler au démontage. */
  attach: () => () => void;
};

export function createSessionGuard(pageUser: string | null, listen: Listen): SessionGuard {
  let current: string | null = pageUser;
  const writers: { whenIdle: () => Promise<boolean> }[] = [];
  return {
    alive: () => current === pageUser,
    watch: (writer) => {
      writers.push(writer);
    },
    attach() {
      const stop = listen((announced) => {
        current = announced;
      });
      let stopped = false;
      return () => {
        if (stopped) return;
        stopped = true;
        // Le démontage ne coupe pas l'écoute tant qu'une écriture est en cours : une annonce d'un autre compte la retient.
        void Promise.all(writers.map((w) => w.whenIdle())).then(stop, stop);
      };
    },
  };
}
