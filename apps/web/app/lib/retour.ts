// Lot M7, tour 2 : un lien vers une fiche du compte porte l'écran d'où l'on vient (`?retour=`), pour que le ✕ de son
// en-tête de fiche y ramène, sans JavaScript aussi. La fiche le filtre par `safeReturn` (chemin interne seulement).
export function withRetour(href: string, back: string): string {
  return `${href}${href.includes("?") ? "&" : "?"}retour=${encodeURIComponent(back)}`;
}
