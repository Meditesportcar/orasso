// Magasin en mémoire de la position donnée à « Ma météo » (lot R8m, tour 2). Sans dépendance native : la session, l'horloge et
// l'appel à l'API sont injectés, pour que les règles se testent. Règles :
//  - la session (compte) est lue AU DÉPART de chaque opération et revérifiée avant d'appliquer la moindre réponse : une réponse
//    qui arrive après une déconnexion ou un autre compte est jetée ;
//  - la position est liée à ce compte et vidée dès que la session change ;
//  - la météo de la position se relit au plus toutes les `REFRESH_MS` (sauf geste manuel) : la limite d'appels de l'API est
//    respectée, et une position gardée ne reste jamais figée.
import type { LatLng } from "../geo";
import type { WeatherAt } from "../weather";

/** Une météo de position plus vieille que ça est relue au retour sur l'écran (la case se rafraîchit côté API toutes les 3 h). */
export const POSITION_REFRESH_MS = 10 * 60_000;
/** Une demande en vol depuis plus longtemps que ça ne bloque plus les relectures (une requête suspendue sans délai). */
export const POSITION_INFLIGHT_STALE_MS = 30_000;

export type PositionState<T = WeatherAt> = {
  owner: string | null;
  coarse: LatLng | null;
  at: T | null;
  fetchedAt: number;
  busy: boolean;
};

/** Lot R8q : `T` est ce que la position donne (la météo de sa case pour « Ma météo », les lieux proches pour « Pratique »). */
export type PositionDeps<T = WeatherAt> = {
  scope: () => string | null;
  now: () => number;
  weatherAt: (position: LatLng) => Promise<T>;
};

/** La session et la génération capturées au geste (« Utiliser ma position ») : revérifiées après chaque attente. */
export type PositionTicket = { owner: string; gen: number };

export function createPositionStore<T = WeatherAt>(deps: PositionDeps<T>) {
  const empty: PositionState<T> = { owner: null, coarse: null, at: null, fetchedAt: 0, busy: false };
  let state: PositionState<T> = empty;
  let generation = 0;
  // Numéro de la dernière demande partie (`give` ou `refresh`) : une réponse n'est appliquée que si aucune demande plus récente est partie
  // depuis (deux relocalisations successives, une relecture revenue après un nouveau geste : la plus récente reste).
  let requestSeq = 0;
  // La dernière demande partie, tant qu'elle n'a pas répondu : une relecture ne part pas pendant qu'une demande est en vol (sauf si elle
  // est suspendue depuis plus de `POSITION_INFLIGHT_STALE_MS`, et seulement si c'est elle-même une relecture : une relecture ne part jamais
  // pendant un geste, quel que soit son âge). Effacée à l'oubli et à l'invalidation (changement de compte).
  let inflight: { seq: number; at: number; kind: "give" | "refresh" } | null = null;
  const listeners = new Set<() => void>();
  const set = (patch: Partial<PositionState<T>>) => {
    state = { ...state, ...patch };
    for (const l of listeners) l();
  };

  const forget = () => {
    generation += 1;
    inflight = null;
    set({ owner: null, coarse: null, at: null, fetchedAt: 0 });
  };

  /** La session a changé depuis la position gardée : on l'oublie. */
  const purgeForeign = () => {
    if (state.owner !== null && state.owner !== deps.scope()) forget();
  };

  const begin = (): PositionTicket | null => {
    const owner = deps.scope();
    return owner ? { owner, gen: generation } : null;
  };

  return {
    getState: () => state,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    /** La position visible pour la session courante. */
    view(): { at: T | null; busy: boolean; coarse: LatLng | null } {
      const mine = state.owner !== null && state.owner === deps.scope();
      return { at: mine ? state.at : null, busy: state.busy, coarse: mine ? state.coarse : null };
    },
    setBusy(busy: boolean) {
      set({ busy });
    },
    forget,
    purgeForeign,
    /** Invalide les demandes en cours (tickets) sans toucher à la position gardée : une transition de session a eu lieu. */
    invalidate() {
      generation += 1;
      inflight = null;
    },
    /** Capture la session et la génération DÈS LE GESTE ; `null` sans session. */
    begin,
    /** La session est-elle restée la même (et la position non oubliée) depuis le geste ? */
    valid(ticket: PositionTicket): boolean {
      return deps.scope() === ticket.owner && generation === ticket.gen;
    },
    /** Une position arrondie vient d'être lue : sa météo est demandée puis gardée, si la session est restée la même. */
    async give(coarse: LatLng, ticket: PositionTicket | null = begin()): Promise<boolean> {
      // Rien n'est envoyé ni gardé si la session a changé depuis le geste (attente du GPS comprise).
      if (!ticket || !this.valid(ticket)) return false;
      const { owner, gen } = ticket;
      const seq = ++requestSeq;
      inflight = { seq, at: deps.now(), kind: "give" };
      try {
        const at = await deps.weatherAt(coarse);
        if (deps.scope() !== owner || gen !== generation || seq !== requestSeq) return false;
        set({ owner, coarse, at, fetchedAt: deps.now() });
        return true;
      } catch {
        return false;
      } finally {
        if (inflight?.seq === seq) inflight = null;
      }
    },
    /** Relit la météo de la position gardée : au plus toutes les `POSITION_REFRESH_MS`, sauf `force` (geste manuel). */
    async refresh(force = false): Promise<void> {
      purgeForeign();
      const { coarse, owner, fetchedAt } = state;
      if (!coarse || owner === null || owner !== deps.scope()) return;
      if (!force && deps.now() - fetchedAt < POSITION_REFRESH_MS) return;
      // Une demande est en vol : sa réponse donnera la position la plus récente (deux relectures ne se chevauchent jamais). Une relecture
      // sautée n'est pas rejouée : le prochain minuteur ou retour au premier plan s'en charge.
      if (inflight !== null && (inflight.kind === "give" || deps.now() - inflight.at < POSITION_INFLIGHT_STALE_MS))
        return;
      const gen = generation;
      const seq = ++requestSeq;
      inflight = { seq, at: deps.now(), kind: "refresh" };
      try {
        const at = await deps.weatherAt(coarse);
        if (
          deps.scope() !== owner ||
          gen !== generation ||
          state.owner !== owner ||
          seq !== requestSeq ||
          state.coarse !== coarse
        )
          return;
        set({ at, fetchedAt: deps.now() });
      } catch {
        // Hors ligne ou limite atteinte : la dernière météo connue reste affichée.
      } finally {
        if (inflight?.seq === seq) inflight = null;
      }
    },
  };
}
