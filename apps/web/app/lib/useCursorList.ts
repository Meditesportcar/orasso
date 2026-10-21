// Liste « Voir la suite » au curseur (lot 57, relecture) : la route charge la première page ; chaque « Voir la suite »
// charge la page suivante (le curseur de l'API, pas un nombre de pages relu depuis le début) et l'ajoute à la liste.
// Il n'y a donc plus de plafond de pages. Une panne garde la liste déjà chargée et laisse « Réessayer » relancer la
// même page. Sans script, le lien « Voir la suite » ouvre la page suivante seule (`?cursor=`).
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

/** État de la liste : la première page du loader (référence gardée pour détecter un nouveau chargement) et la suite. */
export type CursorListState<T> = {
  source: CursorChunk<T>;
  items: T[];
  /** Curseur de la prochaine page à charger (ou de la page qui a échoué) ; null : tout est chargé. */
  to: string | null;
  failed: boolean;
};

export function initialListState<T>(first: CursorChunk<T>): CursorListState<T> {
  return { source: first, items: first.items, to: first.failed ? first.cursor : first.next, failed: first.failed };
}

/**
 * Resynchronise la liste avec le loader (lot 59d) : un nouveau chargement de la route (même recherche relancée,
 * revalidation) rend un nouvel objet `first` ; ses résultats remplacent la liste, pages accumulées comprises (elles
 * viennent d'un état du serveur dépassé). Même objet : l'état local (pages ajoutées) est conservé.
 */
export function syncListState<T>(state: CursorListState<T>, first: CursorChunk<T>): CursorListState<T> {
  return state.source === first ? state : initialListState(first);
}

/** Une page de résultats telle que la renvoie le loader de la route. `cursor` : celui qui l'a demandée ("" = la première). */
export type CursorChunk<T> = { items: T[]; next: string | null; failed: boolean; cursor: string };

export function useCursorList<T, D>(
  first: CursorChunk<T>,
  href: (cursor: string) => string,
  pick: (data: D) => CursorChunk<T> | undefined,
) {
  const fetcher = useFetcher<D>();
  const [raw, setState] = useState(() => initialListState(first));
  // Calculé pendant le rendu : aucun affichage de l'ancienne liste entre le nouveau loader et la resynchronisation.
  const state = syncListState(raw, first);
  if (state !== raw) setState(state);
  const { items, to, failed } = state;
  const asked = useRef<string | null>(null);
  const pickRef = useRef(pick);
  pickRef.current = pick;

  useEffect(() => {
    if (!fetcher.data || fetcher.state !== "idle" || asked.current === null) return;
    const chunk = pickRef.current(fetcher.data as unknown as D);
    if (!chunk || chunk.cursor !== asked.current) return;
    asked.current = null;
    if (chunk.failed) {
      setState((cur) => ({ ...cur, failed: true }));
      return;
    }
    setState((cur) => ({ ...cur, items: [...cur.items, ...chunk.items], to: chunk.next, failed: false }));
  }, [fetcher.data, fetcher.state]);

  const load = () => {
    if (to === null || fetcher.state !== "idle") return;
    asked.current = to;
    void fetcher.load(href(to));
  };
  return { items, to, failed, loading: fetcher.state !== "idle", load };
}

/** Curseur lu dans l'adresse : opaque, borné. "" pour la première page. */
export function cursorParam(url: URL): string {
  return (url.searchParams.get("cursor") ?? "").slice(0, 300);
}

/**
 * Lit une page de l'API au curseur donné. `fetchPage` renvoie la page ou null en cas de panne (réponse refusée ou réseau).
 */
export async function loadChunk<T>(
  cursor: string,
  fetchPage: (cursor: string) => Promise<{ items: T[]; nextCursor: string | null } | null>,
): Promise<CursorChunk<T>> {
  try {
    const page = await fetchPage(cursor);
    if (!page) return { items: [], next: null, failed: true, cursor };
    return { items: page.items, next: page.nextCursor, failed: false, cursor };
  } catch {
    return { items: [], next: null, failed: true, cursor };
  }
}
