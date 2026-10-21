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
 * Resynchronise la liste avec le loader (lot 59d, tour 2) : un nouveau chargement de la route rend un nouvel objet
 * `first`. Même objet : l'état local est conservé. Autre curseur, liste vide ou une seule page affichée : on repart de
 * la nouvelle page. Revalidation après des pages ajoutées (« Garder », demande d'accréditation…) : les éléments affichés
 * sont mis à jour par `id` depuis la nouvelle première page, les nouveaux s'ajoutent en tête, les pages suivantes et le
 * défilement sont gardés (la carte ne disparaît pas). Une revalidation en panne garde la liste affichée.
 */
export function syncListState<T extends { id: string }>(
  state: CursorListState<T>,
  first: CursorChunk<T>,
): CursorListState<T> {
  if (state.source === first) return state;
  const old = state.source;
  const onePage = state.items.length === old.items.length && state.to === (old.failed ? old.cursor : old.next);
  if (first.cursor !== old.cursor || state.items.length === 0 || (onePage && !first.failed)) {
    return initialListState(first);
  }
  if (first.failed) return { ...state, source: first };
  const fresh = new Map(first.items.map((item) => [item.id, item]));
  const shown = new Set(state.items.map((item) => item.id));
  const added = first.items.filter((item) => !shown.has(item.id));
  return { ...state, source: first, items: [...added, ...state.items.map((item) => fresh.get(item.id) ?? item)] };
}

/** Ajoute une page à la liste sans doublon (un élément repoussé à la page suivante par une revalidation). */
export function appendPage<T extends { id: string }>(items: T[], page: T[]): T[] {
  const shown = new Set(items.map((item) => item.id));
  return [...items, ...page.filter((item) => !shown.has(item.id))];
}

/** Une page de résultats telle que la renvoie le loader de la route. `cursor` : celui qui l'a demandée ("" = la première). */
export type CursorChunk<T> = { items: T[]; next: string | null; failed: boolean; cursor: string };

export function useCursorList<T extends { id: string }, D>(
  first: CursorChunk<T>,
  href: (cursor: string) => string,
  pick: (data: D) => CursorChunk<T> | undefined,
) {
  const fetcher = useFetcher<D>();
  const [raw, setState] = useState(() => initialListState(first));
  const asked = useRef<string | null>(null);
  // Calculé pendant le rendu : aucun affichage de l'ancienne liste entre le nouveau loader et la resynchronisation.
  const state = syncListState(raw, first);
  if (state !== raw) {
    // Une page demandée avant la revalidation est ignorée à son arrivée (pas de page en double).
    asked.current = null;
    setState(state);
  }
  const { items, to, failed } = state;
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
    setState((cur) => ({ ...cur, items: appendPage(cur.items, chunk.items), to: chunk.next, failed: false }));
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
