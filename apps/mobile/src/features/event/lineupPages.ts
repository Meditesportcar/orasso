// Lot R4b, tour 2 : les pages suivantes du plateau (« Voir les N autres »), gardées comme les autres lectures. Une page
// arrivée après un changement de catégorie, une relecture de la première page ou un changement de compte (déconnexion)
// est jetée : elle ne mélange pas les catégories et ne remet pas de pseudos à l'écran. Pur, testé seul.
import { createRequestGate } from "../../lib/requestGate";

export type LineupPage<T> = { cars: T[]; nextCursor: number | null };

export function createLineupPager(scope: () => string | null) {
  const gate = createRequestGate(scope);
  return {
    /** Nouvelle première page (catégorie, relecture, compte) : les pages en cours ne comptent plus. */
    reset: () => gate.invalidate(),
    /** Charge une page ; `null` si sa réponse est arrivée trop tard (jetée). */
    async more<T>(load: () => Promise<LineupPage<T>>): Promise<LineupPage<T> | null> {
      const ticket = gate.follow();
      const page = await load();
      return ticket.current() ? page : null;
    },
  };
}
