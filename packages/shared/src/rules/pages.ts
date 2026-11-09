// Lire toutes les pages d'une liste curseur (lot R7l3, tour 2) : la grille d'un vote peut dépasser 5 000 candidats. La lecture
// continue de page en page jusqu'à la fin (`next` nul) ; une page qui échoue, ou une pagination qui ne finit pas (garde de
// sécurité très haute), **ne rend jamais une liste présentée comme complète** : `complete` est faux et les pages déjà lues
// restent dans `items` (l'écran dit l'échec et propose de reprendre, il n'affiche pas une grille tronquée ou vide en silence).
export interface PageOf<T> {
  items: T[];
  next: number | null;
}

export interface PagesResult<T> {
  items: T[];
  /** Faux : une page a échoué ou la garde a été atteinte ; `items` est partiel. */
  complete: boolean;
}

export const PAGES_GUARD = 10_000;

export async function collectPages<T>(
  fetchPage: (cursor: number) => Promise<PageOf<T>>,
  guard: number = PAGES_GUARD,
): Promise<PagesResult<T>> {
  const items: T[] = [];
  let cursor: number | null = 0;
  for (let pages = 0; cursor !== null; pages++) {
    if (pages >= guard) return { items, complete: false };
    try {
      const page: PageOf<T> = await fetchPage(cursor);
      items.push(...page.items);
      cursor = page.next;
    } catch {
      return { items, complete: false };
    }
  }
  return { items, complete: true };
}
