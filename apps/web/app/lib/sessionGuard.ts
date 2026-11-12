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

/**
 * La garde d'une page : la même tant que le compte de la page est le même, une neuve (donc des écrivains neufs, côté appelant)
 * quand il change sans démontage (A -> B sur la même fiche).
 */
export function guardFor(
  previous: { userId: string | null; guard: SessionGuard } | null,
  userId: string | null,
  listen: Listen,
): { userId: string | null; guard: SessionGuard } {
  return previous && previous.userId === userId ? previous : { userId, guard: createSessionGuard(userId, listen) };
}

/** Une annonce de session rend-elle la page périmée ? Oui si elle nomme un autre compte que celui de la page. */
export const pageSessionStale = (pageUser: string | null, announced: string | null): boolean => announced !== pageUser;

/** L'état « page périmée » une fois posé reste jusqu'au rechargement : une annonce tardive du compte de la page ne le lève pas. */
export const latchStale = (wasStale: boolean, pageUser: string | null, announced: string | null): boolean =>
  wasStale || pageSessionStale(pageUser, announced);
