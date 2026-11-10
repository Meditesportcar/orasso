import type { StoryMentionItem, StoryMentions } from "@orasso/shared";

// Les pages « Voir plus » des mentions (lot R7h, tour 4) : à chaque revalidation de la page, les pages déjà chargées sont
// relues à la même profondeur (une mention repartagée ailleurs ne propose plus « Ajouter »), sans vider ce qui est affiché
// pendant la lecture.

export type PageResult = { ok: true; data: StoryMentions } | { ok: false; error: { message: string } };
export type FetchPage = (cursor: string) => Promise<PageResult>;

export type Reread =
  | { ok: true; items: StoryMentionItem[]; next: string | null; depth: number }
  | { ok: false; error: string };

/**
 * Relit `depth` pages à la suite de la première (dont le curseur suivant est `firstNext`). S'arrête avant si l'API n'a plus
 * de suite. `current()` dit si la lecture est encore la dernière demandée : sinon `null` (rien n'est appliqué). Une mention
 * déjà vue sur une page précédente n'est jamais rendue deux fois.
 */
export async function rereadPages(
  fetchPage: FetchPage,
  firstNext: string | null,
  depth: number,
  current: () => boolean,
): Promise<Reread | null> {
  const items: StoryMentionItem[] = [];
  const seen = new Set<string>();
  let next = firstNext;
  let read = 0;
  while (read < depth && next) {
    const res = await fetchPage(next);
    if (!current()) return null;
    if (!res.ok) return { ok: false, error: res.error.message };
    for (const m of res.data.items) {
      if (seen.has(m.storyId)) continue;
      seen.add(m.storyId);
      items.push(m);
    }
    next = res.data.nextCursor;
    read++;
  }
  return { ok: true, items, next, depth: read };
}
