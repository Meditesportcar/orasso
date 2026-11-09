// Pages suivantes d'une liste (« Voir plus ») derrière une première page rechargeable (lot R7c2, tour 2). Les écrans
// Activité, Demandes et Messages relisent leur première page à tout moment (canal temps réel, décision, tirer pour
// rafraîchir) : chaque première page remplacée **vide** les pages suivantes, et la réponse d'une page demandée pour une
// première page dépassée est rejetée. L'état de chargement suit la même règle : une demande de « Voir plus » en cours sur
// une première page remplacée ne bloque jamais le bouton. La première page est l'identifiant de la requête active (un
// nouvel objet à chaque lecture réussie de `useApi`).
import { useCallback, useReducer } from "react";

export type TailState<T> = {
  /** La première page pour laquelle ces pages suivantes ont été demandées. */
  base: unknown;
  items: T[];
  /** Curseur de la page suivante ; `undefined` tant qu'aucune page suivante n'est arrivée (alors celui de la première page). */
  next: string | null | undefined;
  busy: boolean;
  error: string | null;
};

export type TailAction<T> =
  | { type: "begin"; base: unknown }
  | { type: "done"; base: unknown; items: T[]; next: string | null }
  | { type: "fail"; base: unknown; message: string };

export function freshTail<T>(base: unknown): TailState<T> {
  return { base, items: [], next: undefined, busy: false, error: null };
}

/** L'état vu pour la première page courante : celui d'une première page dépassée n'existe plus. */
export function tailFor<T>(state: TailState<T>, base: unknown): TailState<T> {
  return state.base === base ? state : freshTail<T>(base);
}

export function tailReducer<T>(state: TailState<T>, action: TailAction<T>): TailState<T> {
  if (action.type === "begin") {
    const s = tailFor(state, action.base);
    return { ...s, busy: true, error: null };
  }
  // Réponse ou échec d'une demande pour une première page remplacée depuis : rejetés.
  if (state.base !== action.base) return state;
  if (action.type === "done") {
    return { ...state, items: [...state.items, ...action.items], next: action.next, busy: false, error: null };
  }
  return { ...state, busy: false, error: action.message };
}

/**
 * Les pages suivantes d'une liste : `base` est la première page (`useApi(...).data`, `null` tant qu'elle manque),
 * `firstNext` son curseur, `fetchPage` charge la page d'un curseur. Rend ce qui s'ajoute à la première page.
 */
export function useTail<T>(
  base: unknown,
  firstNext: string | null,
  fetchPage: (cursor: string) => Promise<{ items: T[]; nextCursor: string | null }>,
  errorOf: (e: unknown) => string,
) {
  const [state, dispatch] = useReducer(
    tailReducer as (s: TailState<T>, a: TailAction<T>) => TailState<T>,
    freshTail<T>(base),
  );
  const tail = tailFor(state, base);
  const nextCursor = tail.next === undefined ? firstNext : tail.next;
  const more = useCallback(async () => {
    if (!nextCursor || tail.busy) return;
    dispatch({ type: "begin", base });
    try {
      const page = await fetchPage(nextCursor);
      dispatch({ type: "done", base, items: page.items, next: page.nextCursor });
    } catch (e) {
      dispatch({ type: "fail", base, message: errorOf(e) });
    }
  }, [base, nextCursor, tail.busy, fetchPage, errorOf]);
  return { items: tail.items, nextCursor, busy: tail.busy, error: tail.error, more };
}
