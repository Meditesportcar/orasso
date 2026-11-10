// La barre des stories telle que `StoriesBar` l'a affichée en dernier (lot R8s), gardée en mémoire (jamais écrite sur le disque :
// vie privée) pour que la lecture enchaînée fige sa chaîne AVANT d'enregistrer la vue de la première story, sur ce que l'utilisateur
// a sous les yeux. Propre à un compte et périmée au bout de 10 minutes.
import type { StoryBar } from "@orasso/shared";

const MAX_AGE_MS = 10 * 60_000;
let last: { userId: string; at: number; bar: StoryBar } | null = null;

export function rememberBar(userId: string | null | undefined, bar: StoryBar | null | undefined, at = Date.now()) {
  last = userId && bar ? { userId, at, bar } : null;
}

export function barFor(userId: string | null | undefined, at = Date.now()): StoryBar | null {
  return last && userId && last.userId === userId && at - last.at < MAX_AGE_MS ? last.bar : null;
}
