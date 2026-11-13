// La barre des stories telle que `StoriesBar` l'a affichée en dernier (lot R8s), gardée en mémoire (jamais écrite sur le disque :
// vie privée) pour que la lecture enchaînée fige sa chaîne AVANT d'enregistrer la vue de la première story, sur ce que l'utilisateur
// a sous les yeux. Propre à un compte **et à une casquette** (`barScope`, lot R9n tour 1) et périmée au bout de 10 minutes.
import type { StoryBar } from "@orasso/shared";

const MAX_AGE_MS = 10 * 60_000;
let last: { userId: string; at: number; bar: StoryBar } | null = null;

export function rememberBar(userId: string | null | undefined, bar: StoryBar | null | undefined, at = Date.now()) {
  last = userId && bar ? { userId, at, bar } : null;
}

export function barFor(userId: string | null | undefined, at = Date.now()): StoryBar | null {
  return last && userId && last.userId === userId && at - last.at < MAX_AGE_MS ? last.bar : null;
}

/** La portée de la barre mémorisée : le compte et l'acteur (une casquette ne reprend jamais la barre d'une autre). */
export const barScope = (userId: string | null | undefined, actor: string | null): string | null =>
  userId ? `${userId}|${actor ?? ""}` : null;

/** La barre lue pour cet acteur ; la lecture d'un autre acteur (ancienne, ou retardée) ne s'affiche jamais. */
export const barOfActor = (
  read: { actor: string | null; bar: StoryBar } | null | undefined,
  actor: string | null,
): StoryBar | null => (read && read.actor === actor ? read.bar : null);
