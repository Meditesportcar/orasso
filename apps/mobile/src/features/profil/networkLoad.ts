// Lot R4c, tour 2 : lectures de « Ton réseau ». Chaque lecture (onglet, recherche) part avec un ticket ; une réponse
// arrivée après une lecture plus récente, ou sous un autre compte, est jetée (`requestGate`) : une recherche lente « a »
// n'écrase jamais celle de « al ». La page suivante (« Voir plus ») suit la dernière lecture, et seulement elle.
import { createRequestGate } from "../../lib/requestGate";

export function createNetworkLoader<K, R>(deps: {
  /** Le compte ouvert (une réponse lue sous un autre compte est jetée). */
  scope: () => string | null;
  fetch: (key: K) => Promise<R>;
  apply: (result: R, key: K) => void;
  onError: (error: unknown) => void;
  onSettled?: () => void;
}) {
  const gate = createRequestGate(deps.scope);
  return {
    /** Nouvelle lecture : les précédentes ne comptent plus. */
    async load(key: K): Promise<void> {
      const ticket = gate.start();
      try {
        const result = await deps.fetch(key);
        if (ticket.current()) deps.apply(result, key);
      } catch (error) {
        if (ticket.current()) deps.onError(error);
      } finally {
        if (ticket.current()) deps.onSettled?.();
      }
    },
    /** Suite de la dernière lecture (page suivante) : jetée si une autre lecture est partie entre-temps. */
    async more<M>(fetch: () => Promise<M>, apply: (page: M) => void): Promise<void> {
      const ticket = gate.follow();
      try {
        const page = await fetch();
        if (ticket.current()) apply(page);
      } catch (error) {
        if (ticket.current()) deps.onError(error);
      }
    },
  };
}
