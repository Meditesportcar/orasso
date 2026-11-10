import type { StoriesByAuthor } from "@orasso/shared";

// Quand la section « Mentions et Ma story » de la page de l'événement se montre (lot R7h, tour 4). Pures, testées.

/** Le résultat de la lecture de « Ma story » : `null` = pas lue (événement non publié). */
export type MineRead = { ok: true; data: Pick<StoriesByAuthor, "stories"> } | { ok: false } | null;

/** « Aucune story » (lecture réussie) et « lecture en échec » (des stories peuvent être en ligne) ne se confondent pas. */
export function mineFlags(mine: MineRead): { hasMine: boolean; mineFailed: boolean } {
  return { hasMine: Boolean(mine?.ok && mine.data.stories.length > 0), mineFailed: Boolean(mine && !mine.ok) };
}

/**
 * La section se montre le jour de l'événement, tant qu'une story de la structure est en ligne, quand sa lecture a échoué
 * (erreur et « Réessayer »), et juste après un retrait (le message de confirmation reste visible, même si c'était la dernière).
 */
export function showStorySection(a: {
  published: boolean;
  fieldDay: boolean;
  hasMine: boolean;
  mineFailed: boolean;
  notice: string | null;
}): boolean {
  return a.published && (a.fieldDay || a.hasMine || a.mineFailed || a.notice === "removed");
}
