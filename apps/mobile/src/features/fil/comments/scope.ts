// Le magasin des commentaires est rangé par compte **et** par acteur (lot R9n, tour 1, point 2) : changer de casquette repart d'un
// magasin neuf (feuilles, envois en attente, réponses en route jetées). Un commentaire en attente ou en échec ne peut donc jamais
// être renvoyé « Réessayer » sous une autre casquette que celle où il a été écrit.
export function commentsScope(account: string | null, actor: string | null): string | null {
  return account === null ? null : `${account}|${actor ?? ""}`;
}
