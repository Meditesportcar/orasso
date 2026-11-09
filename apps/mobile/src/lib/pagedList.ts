// Liste lue page par page (« Voir tout » de « Ses partenaires ») : l'état est pur, pour que « Réessayer » refasse la lecture
// qui a échoué (son curseur ; pas de curseur = première page, donc une actualisation), jamais la page suivante déduite.
export type PagedList<T> = {
  items: T[];
  total: number;
  next: string | null;
  /** La lecture en échec : `cursor` absent = actualisation de la première page. `null` = aucune panne. */
  failed: { cursor?: string } | null;
};

export type PageRead<T> = { items: T[]; total: number; nextCursor: string | null };

export const emptyPagedList = <T>(): PagedList<T> => ({ items: [], total: 0, next: null, failed: null });

/** Une page lue : sans curseur elle remplace tout (première page ou actualisation), avec curseur elle s'ajoute. */
export function pageLoaded<T>(list: PagedList<T>, cursor: string | undefined, page: PageRead<T>): PagedList<T> {
  return {
    items: cursor ? [...list.items, ...page.items] : page.items,
    total: page.total,
    next: page.nextCursor,
    failed: null,
  };
}

/** Une lecture a échoué : les pages déjà là restent, et la lecture à refaire est mémorisée telle quelle. */
export function pageFailed<T>(list: PagedList<T>, cursor: string | undefined): PagedList<T> {
  return { ...list, failed: { cursor } };
}

/** Le curseur de la lecture à refaire par « Réessayer » (`undefined` : la première page). */
export function retryCursor<T>(list: PagedList<T>): string | undefined {
  return list.failed?.cursor;
}
