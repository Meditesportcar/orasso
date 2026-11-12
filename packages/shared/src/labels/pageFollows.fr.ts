// Mots de l'API pour les abonnements d'une casquette (lot R9a). Les écrans (R9n, R9b) ont leurs propres libellés.
export const pageFollowErrors = {
  actorForbidden: "Tu ne peux pas agir au nom de cette page.",
  existingRoute:
    "Pour suivre une personne, un organisateur ou un pro, utilise « Suivre » sur sa page : cette route ne sert qu'aux prestataires et aux médias.",
  selfFollow: "Tu ne peux pas suivre ta propre page.",
  notFound: "Page ou profil introuvable.",
  privateAccount: "Ce compte est privé : une page ne peut pas le suivre.",
  pageStoryPublic: "Mets à jour l'appli : une story de page est publique.",
  invalidTarget: "Clé de page ou de compte invalide.",
} as const;
