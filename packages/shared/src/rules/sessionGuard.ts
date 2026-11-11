// Lot R8q, tour 2 : une lecture lancée sous un compte n'est jamais rangée ni affichée sous un autre. Le compte (identité connue) et la
// génération de session sont capturés au départ et revérifiés à l'arrivée ; sans identité connue, rien ne part (`begin` rend `null`).
export type SessionTicket = { who: string; gen: number };

export function createSessionGuard(scope: () => string | null) {
  let last: string | null = scope();
  let generation = 0;
  // Un changement de compte observé, même s'il revient ensuite au même, change de génération.
  const sync = () => {
    const now = scope();
    if (now !== last) {
      last = now;
      generation += 1;
    }
  };
  return {
    /** À appeler quand la session peut avoir changé (annonce de session, rendu). */
    sync,
    /** Le compte et la génération du départ, ou `null` tant que l'identité n'est pas connue. */
    begin(): SessionTicket | null {
      sync();
      const who = scope();
      return who ? { who, gen: generation } : null;
    },
    /** La réponse est-elle encore celle du même compte et de la même génération ? */
    valid(ticket: SessionTicket): boolean {
      sync();
      return scope() === ticket.who && generation === ticket.gen;
    },
  };
}
