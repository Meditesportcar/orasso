// Modèle des commentaires par casquette (R9n, tour 3) :
// 1. PAR COMPTE : tout s'en va à la déconnexion ou au changement de compte (magasins, `sendActors`) ; ÉCRAN COMMUN : la feuille ouverte
//    (`opening`) et les hôtes montés (`hosts`) ne dépendent pas de la casquette.
// 2. PAR COMPTE ET CASQUETTE (`commentsScope`) : un magasin à part (feuille, brouillon, envois en attente, publications changées),
//    conservé quand on change de casquette ; revenir à A retrouve le brouillon et le commentaire en échec d'A.
// 3. UN TICKET PORTE SA PORTÉE (`s`) : la réponse de l'API s'écrit dans le magasin de cette portée (A reçoit sa confirmation même si B
//    est active, jamais de « en cours » sans fin), jamais dans celui de la casquette active ; `isCurrent` dit si c'est la casquette active.
// 4. Un envoi garde l'acteur de son premier essai (`sendActors`) ; une lecture partie sous A n'écrit que chez A.
export function commentsScope(account: string | null, actor: string | null): string | null {
  return account === null ? null : `${account}|${actor ?? ""}`;
}
