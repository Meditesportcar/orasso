// L'Ã¢ge des donnÃ©es gardÃ©es aprÃ¨s une coupure (lot R7l2, tour 3) : l'heure de la lecture et l'heure de la comparaison
// viennent de la MÃŠME horloge, celle d'Orasso (heure de l'appareil + dÃ©calage de la simulation). Avec deux horloges, une
// simulation avancÃ©e de plusieurs jours annonÃ§ait des milliers de minutes pour des donnÃ©es tout juste lues.
import { voteStaleMinutes } from "@orasso/shared";

import { nowMs } from "../../../lib/clock";

/** L'instant de la lecture rÃ©ussie, Ã  l'heure d'Orasso. */
export const readStamp = () => nowMs();

/** Les minutes Ã©coulÃ©es depuis la lecture, ou `null` quand rien n'est pÃ©rimÃ© (pas d'erreur, pas de donnÃ©es, pas de lecture). */
export function staleSince(loadedAt: number | null, error: boolean, hasData: boolean): number | null {
  if (!error || !hasData || loadedAt === null) return null;
  return voteStaleMinutes(loadedAt, nowMs());
}
