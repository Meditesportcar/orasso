// Horloge simulée (lot 34a), côté serveur du site. Le site la connaît par la variable DEV_CLOCK (la même que l'API, posée
// dans le même .env en local). Sans elle : aucun appel de plus, aucun lien, aucune page.
import { api } from "./api.server";
import { clockOffsetMs } from "./clock";

export const devClockEnabled = () => process.env.DEV_CLOCK === "on";

/**
 * Décalage de l'API, lu sur une réponse (`/health`, légère) quand l'horloge simulée est active ; les autres appels de
 * l'API le mettent à jour aussi (`api.server.ts`). 0 hors développement.
 */
export async function readClockOffset(request: Request): Promise<number> {
  if (devClockEnabled()) await api(request, "/health");
  return clockOffsetMs();
}
