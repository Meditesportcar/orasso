// Lot R4c (maquettes R4.5, R4.5b, R4.6, R4.6b, R4.6c) : véhicule principal, suivre une personne, listes du réseau,
// aperçu du profil public. Mêmes mots dans l'appli et sur le site.

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

export const mainVehicleLabels = {
  /** Étiquette du principal dans le Garage (une marque, pas un bouton). */
  tag: "Principal",
  /** Étiquette de la feuille de candidature et de la vitrine. */
  candTag: "Véhicule principal",
  lastUsed: "Dernière utilisée",
  feature: "Mettre en avant",
  featureHint: "Il s'affiche en grand dans ton garage et sera proposé d'office à tes candidatures.",
  edit: "Modifier",
  editHint: "Photos, plaque, fiche technique",
  share: "Partager son affiche",
  remove: "Retirer du garage",
  menu: (label: string) => `Menu du véhicule ${label}`,
  others: "Tes autres véhicules",
  confirmed: (label: string) => `Ton véhicule principal : ${label}. Il sera proposé d'office à tes candidatures.`,
  showcaseMain: "★ Principal",
} as const;

export const networkLabels = {
  followers: (n: number) => plural(n, "abonné", "abonnés"),
  following: (n: number) => plural(n, "abonnement", "abonnements"),
  requests: (n: number) => plural(n, "demande", "demandes"),
  outings: (n: number) => plural(n, "sortie", "sorties"),
  countsGroup: "Abonnés, abonnements et sorties",
  title: "Ton réseau",
  search: "Chercher un pseudo",
  searchLabel: "Chercher dans la liste",
  // Lot R6b (maquette R6.1) : le bouton unique du profil d'un membre et des listes.
  follow: "Suivre",
  followBack: "Suivre en retour",
  request: "Demander à suivre",
  followed: "Abonné",
  requested: "Demandé",
  followsYou: "Te suit",
  unfollow: "Ne plus suivre",
  unfollowConfirm: (pseudo: string) => `Ne plus suivre ${pseudo} ?`,
  unfollowPrivateHint: "Son compte est privé : pour le suivre à nouveau, il faudra redemander.",
  cancelRequest: "Annuler la demande",
  cancelRequestConfirm: (pseudo: string) => `Annuler ta demande à ${pseudo} ?`,
  keep: "Garder",
  accept: "Accepter",
  decline: (pseudo: string) => `Refuser la demande de ${pseudo}`,
  accepted: (pseudo: string) => `${pseudo} te suit maintenant.`,
  declined: "Demande refusée. La personne n'est pas prévenue.",
  // Lot R6b, tour 2 : « Retirer cet abonné » (menu de la ligne dans Abonnés, confirmation).
  rowMenu: (pseudo: string) => `Plus : ${pseudo}`,
  removeFollower: "Retirer cet abonné",
  removeFollowerConfirm: (pseudo: string) => `Retirer ${pseudo} de tes abonnés ?`,
  removeFollowerHint: "Cette personne n'est pas prévenue. Elle ne voit plus ce qui est réservé à tes abonnés.",
  remove: "Retirer",
  removed: (pseudo: string) => `${pseudo} ne fait plus partie de tes abonnés.`,
  groupPeople: "Personnes",
  groupStructures: "Organisateurs",
  groupPros: "Pros",
  more: "Voir plus",
  write: (pseudo: string) => `Écrire à ${pseudo}`,
  privacyNoteStrong: "Toi seul vois ces listes.",
  privacyNote: "Les autres membres voient seulement les nombres.",
  emptyFollowers: "Personne ne te suit encore. Ton profil public se partage depuis « Mon profil public ».",
  emptyFollowing: "Tu ne suis encore personne.",
  emptyRequests: "Aucune demande en attente.",
  requestsHint: "Ton compte est privé : chacun te demande avant de te suivre.",
  emptySearch: "Personne ne correspond à cette recherche.",
  privateAccount: "Compte privé : on le suit sur demande.",
  /** Profil d'un compte privé que l'on ne suit pas (maquette R6.1). */
  privateLineStrong: "Ses photos, ses sorties, son crew et ses réseaux sont pour ses abonnés.",
  privateLineAsk: "Demande à suivre ce compte : la personne accepte ou non.",
  privateLineWaiting: "Ta demande attend sa réponse.",
  structureCaption: "Organisateur",
  proCaption: "Pro",
  /** QR de compte et lien de profil (`/ami/:jeton`) : suivre la personne. */
  followedNow: (pseudo: string) => `Tu suis ${pseudo}.`,
  requestedNow: (pseudo: string) => `Demande envoyée à ${pseudo} : elle accepte ou non.`,
  followPseudo: (pseudo: string) => `Suivre ${pseudo}`,
  ownInviteLink: "C'est ton propre lien : partage-le pour inviter d'autres passionnés sur Orasso.",
} as const;

export const publicPreviewLabels = {
  entry: "Mon profil public",
  entryHint: "Comme te voient les autres",
  title: "Mon profil public",
  subtitle: "Aperçu : ce que voient les membres",
  asMember: "Vu par un membre",
  asFollower: "Vu par un abonné",
  bannerMemberPublic: "Ton profil vu par un membre connecté. Tes abonnés voient la même chose.",
  bannerMemberPrivate: "Ton profil vu par un membre qui ne te suit pas. Tes abonnés voient tout.",
  bannerFollower: "Ton profil vu par un abonné : tout, sauf tes coordonnées.",
  inert: "Les boutons ne font rien dans l'aperçu : c'est ce que voient les autres.",
  garage: "Son garage",
  vehiclesPrivate: "Ses véhicules",
  vehiclesPrivateHint: "marque et modèle",
  privateRest: "Le reste (photos du garage, sorties en détail, crew) est réservé à tes abonnés.",
  privateAccount: "Compte privé",
  privacy: "Régler la confidentialité",
  upcoming: "Ses sorties à venir",
  noUpcoming: "Aucune sortie à venir.",
  crew: "Son crew",
} as const;

export const followNotificationTitle = "Nouvel abonné";
export const followRequestNotificationTitle = "Demande d'abonnement";
export const followAcceptedNotificationTitle = "Demande acceptée";
