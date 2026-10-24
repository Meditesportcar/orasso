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
  friends: (n: number) => plural(n, "ami", "amis"),
  outings: (n: number) => plural(n, "sortie", "sorties"),
  countsGroup: "Abonnés, abonnements et amis",
  title: "Ton réseau",
  search: "Chercher un pseudo",
  searchLabel: "Chercher dans la liste",
  follow: "Suivre",
  followBack: "Suivre aussi",
  followed: "Suivi",
  unfollow: "Ne plus suivre",
  groupPeople: "Personnes",
  groupStructures: "Organisateurs",
  groupPros: "Pros",
  requestsIn: "Demandes reçues",
  myFriends: "Tes amis",
  more: "Voir plus",
  write: (pseudo: string) => `Écrire à ${pseudo}`,
  yourFriend: "dans tes amis",
  privacyNoteStrong: "Toi seul vois ces listes.",
  privacyNote:
    "Les autres voient seulement les nombres : tout le monde si ton compte est public, tes amis s'il est privé.",
  emptyFollowers: "Personne ne te suit encore. Ton profil public se partage depuis « Mon profil public ».",
  emptyFollowing: "Tu ne suis encore personne.",
  emptyFriends: "Pas encore d'ami. Cherche une personne ou scanne son QR de compte.",
  emptySearch: "Personne ne correspond à cette recherche.",
  privateAccount: "Compte privé : on y entre en ami.",
  structureCaption: "Organisateur",
  proCaption: "Pro",
} as const;

export const publicPreviewLabels = {
  entry: "Mon profil public",
  entryHint: "Comme te voient les autres",
  title: "Mon profil public",
  subtitle: "Aperçu : ce que voient les membres",
  asMember: "Vu par un membre",
  asFriend: "Vu par un ami",
  bannerMemberPublic: "Ton profil vu par un membre connecté. Tes amis voient la même chose.",
  bannerMemberPrivate: "Ton profil vu par un membre qui n'est pas ton ami. Tes amis voient tout.",
  bannerFriend: "Ton profil vu par un ami : tout, sauf tes coordonnées.",
  inert: "Les boutons ne font rien dans l'aperçu : c'est ce que voient les autres.",
  garage: "Son garage",
  vehiclesPrivate: "Ses véhicules",
  vehiclesPrivateHint: "marque et modèle",
  privateRest: "Le reste (photos du garage, sorties, crew, nombres) est réservé à tes amis.",
  privateAccount: "Compte privé",
  privacy: "Régler la confidentialité",
  upcoming: "Ses sorties à venir",
  noUpcoming: "Aucune sortie à venir.",
  crew: "Son crew",
} as const;

export const followNotificationTitle = "Nouvel abonné";
