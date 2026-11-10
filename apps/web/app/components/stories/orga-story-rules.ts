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

/**
 * Lot R7h, tour 6 : le cycle de vie du message de confirmation (« ?story=added|removed »). Affiché une fois ; le paramètre
 * est retiré de l'adresse (cette navigation recharge la page, premier chargement sans message : on arme) ; la revalidation
 * suivante, ou un autre événement, l'efface. Une fois effacé, la section se referme si plus rien ne la justifie.
 */
export type StoryMessageState = { message: "added" | "removed" | null; eventId: string | null; armed: boolean };
export const noStoryMessage: StoryMessageState = { message: null, eventId: null, armed: false };

export function reduceStoryMessage(
  s: StoryMessageState,
  load: { eventId: string; notice: string | null },
): StoryMessageState {
  if (load.notice === "added" || load.notice === "removed") {
    return s.message === load.notice && s.eventId === load.eventId && !s.armed
      ? s
      : { message: load.notice, eventId: load.eventId, armed: false };
  }
  if (!s.message) return s;
  if (s.eventId !== load.eventId) return noStoryMessage;
  return s.armed ? noStoryMessage : { ...s, armed: true };
}

/** Le message à montrer pour cet événement (jamais celui d'un autre, même pendant le rendu qui précède l'effacement). */
export const visibleStoryMessage = (s: StoryMessageState, eventId: string): "added" | "removed" | null =>
  s.eventId === eventId ? s.message : null;
