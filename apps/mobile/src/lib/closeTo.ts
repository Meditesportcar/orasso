// Lot M7, tour 2 (relecture Codex) : la cible du ✕ d'une page de l'appli passée par `?retour=`. Seul un chemin de
// l'appli est accepté (« /… », jamais « //… » ni une adresse complète) ; sinon, la page revient à son onglet.

/** Le chemin de retour s'il est sûr, sinon `null`. */
export function appReturn(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("://") || value.includes("\\")) return null;
  return value;
}

/** L'adresse d'une page avec son retour (`/notes?retour=%2Fevenement%2F…`). */
export function withReturn(path: string, back: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}retour=${encodeURIComponent(back)}`;
}
