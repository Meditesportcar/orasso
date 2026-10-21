// Liste « Voir la suite » au curseur (lot 57, relecture) : la route charge la première page ; chaque « Voir la suite »
// charge la page suivante (le curseur de l'API, pas un nombre de pages relu depuis le début) et l'ajoute à la liste.
// Il n'y a donc plus de plafond de pages. Une panne garde la liste déjà chargée et laisse « Réessayer » relancer la
// même page. Sans script, le lien « Voir la suite » ouvre la page suivante seule (`?cursor=`).
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

/** Une page de résultats telle que la renvoie le loader de la route. `cursor` : celui qui l'a demandée ("" = la première). */
export type CursorChunk<T> = { items: T[]; next: string | null; failed: boolean; cursor: string };

export function useCursorList<T, D>(
  first: CursorChunk<T>,
  href: (cursor: string) => string,
  pick: (data: D) => CursorChunk<T> | undefined,
) {
  const fetcher = useFetcher<D>();
  const [items, setItems] = useState(first.items);
  /** Curseur de la prochaine page à charger (ou de la page qui a échoué) ; null : tout est chargé. */
  const [to, setTo] = useState<string | null>(first.failed ? first.cursor : first.next);
  const [failed, setFailed] = useState(first.failed);
  const asked = useRef<string | null>(null);
  const pickRef = useRef(pick);
  pickRef.current = pick;

  useEffect(() => {
    if (!fetcher.data || fetcher.state !== "idle" || asked.current === null) return;
    const chunk = pickRef.current(fetcher.data as unknown as D);
    if (!chunk || chunk.cursor !== asked.current) return;
    asked.current = null;
    if (chunk.failed) {
      setFailed(true);
      return;
    }
    setItems((current) => [...current, ...chunk.items]);
    setTo(chunk.next);
    setFailed(false);
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
