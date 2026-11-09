// La route « Publier une story » est créée par le lot R7f3 (même vague) : tant qu'elle n'existe pas, le « + » de la barre ne
// mène nulle part (jamais un écran « introuvable »). Détection au chargement : Metro liste les fichiers du dossier
// `app/story` ; dès que `publier.tsx` y est, le « + » s'active, sans qu'aucun des deux lots ait à modifier l'autre.
declare const require: { context?: (dir: string, deep: boolean, filter: RegExp) => { keys: () => string[] } };

let found: boolean | null = null;

/** `"/story/publier"` si l'écran existe, sinon `null`. */
export function storyPublishRoute(): "/story/publier" | null {
  if (found === null) {
    try {
      const ctx = require.context?.("../../app/story", false, /^\.\/publier\.tsx$/);
      found = Boolean(ctx && ctx.keys().length > 0);
    } catch {
      found = false;
    }
  }
  return found ? "/story/publier" : null;
}
