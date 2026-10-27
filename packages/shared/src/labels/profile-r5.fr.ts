// Lot R5b (maquettes R5.4, R5.5, R5.6, R5.6b validées le 26/10, remarque 6 de Damien) : onglet Profil avec la roue
// dentée et l'écran « Réglages », « Modifier mon profil » avec les réseaux, le profil d'un membre et son aperçu. Mêmes
// mots dans l'appli et sur le site.
import { type SocialNetwork, socialLabel } from "../rules/socials";

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

export const settingsHubLabels = {
  title: "Réglages",
  /** La roue dentée de la carte du profil. */
  open: "Réglages",
  editProfile: "Modifier mon profil",
  editProfileCaption: "Photo, pseudo, description, réseaux",
  account: "Compte",
  accountCaption: "E-mail, mot de passe, appareils, mes sanctions",
  notifications: "Notifications",
  notificationsCaption: "Candidatures, jour J, messages, abonnés",
  privacy: "Confidentialité",
  privacyCaption: (isPrivate: boolean) =>
    `${isPrivate ? "Profil privé" : "Profil public"}, export de mes données, suppression`,
  appearance: "Apparence",
  help: "Aide",
  helpCaption: "Tutos, questions fréquentes, nous écrire",
  signOut: "Se déconnecter",
} as const;

export const profilePhotoLabels = {
  /** Nom accessible de l'avatar touchable. */
  change: "Changer ta photo de profil",
  sheetTitle: "Ta photo de profil",
  take: "Prendre une photo",
  takeCaption: "Carrée, recadrée à l'étape suivante",
  pick: "Choisir dans la galerie",
  remove: "Retirer la photo",
  removeCaption: "Ton initiale la remplace",
  changeButton: "Changer la photo",
  removeButton: "Retirer",
  saved: "Photo enregistrée.",
  removed: "Photo retirée.",
} as const;

export const editProfileLabels = {
  title: "Modifier mon profil",
  subtitle: "Ce que voient les autres",
  pseudo: "Pseudo",
  pseudoHelp: "C'est lui qu'on voit sur ton profil, au tri et au scan.",
  description: "Description",
  save: "Enregistrer",
  saved: "Profil enregistré.",
  seePublic: "Voir mon profil public",
  /** Le bouton principal grisé dit ce qui manque. */
  nothingChanged: "Rien n'a changé : modifie un champ pour enregistrer.",
  fixErrors: "Corrige les champs signalés pour enregistrer.",
} as const;

export const socialsLabels = {
  title: "Mes réseaux",
  optional: "facultatif",
  hint: "Ton pseudo suffit : Orasso fabrique le lien.",
  placeholder: {
    instagram: "ton pseudo",
    tiktok: "ton pseudo",
    youtube: "ta chaîne",
    facebook: "ton profil ou ta page",
    snapchat: "ton pseudo",
  } satisfies Record<SocialNetwork, string>,
  field: (network: SocialNetwork) => `Pseudo ${socialLabel(network)}`,
  visibilityStrong: "Tes réseaux se voient sur ton profil complet",
  visibilityRest: " : par tous les membres si ton compte est public, par tes abonnés s'il est privé.",
  /** Nom accessible d'un lien de réseau sur un profil. */
  link: (network: SocialNetwork, handle: string) => `${handle} sur ${socialLabel(network)}`,
  group: "Ses réseaux",
} as const;

export const publicProfileLabels = {
  car: "Sa voiture",
  carHint: "véhicule principal",
  mainTag: "Principale",
  next: "Prochaine sortie",
  /** « dans 2 jours », d'après les jours du calendrier (heure de Paris). */
  nextIn: (days: number) => (days <= 0 ? "aujourd'hui" : days === 1 ? "demain" : `dans ${days} jours`),
  together: "Toi aussi : vous y serez tous les deux",
  garage: "Son garage",
  garageOthers: (n: number) => `${n} ${plural(n, "autre", "autres")}`,
  garageAll: (n: number) => `${n} ${plural(n, "véhicule", "véhicules")}`,
  outings: "Ses sorties",
  outingsHint: (n: number) => `${n} ${plural(n, "autre", "autres")} à venir`,
  seenAt: "Vu à",
  seenAtHint: (n: number) => `${n} ${plural(n, "sortie", "sorties")} cette saison`,
  vehiclesPrivate: "Ses véhicules",
  vehiclesPrivateHint: "marque et modèle",
  privateRestStrong: "Le reste est réservé à ses abonnés",
  privateRest: " : photos, sorties, crew, réseaux.",
  privateAccount: "Compte privé",
  write: "Écrire",
  writeTo: (pseudo: string) => `Écrire à ${pseudo}`,
  more: "Plus : signaler",
  edit: "Modifier",
  noVehicle: "Pas encore de véhicule.",
  noOuting: "Aucune sortie à venir.",
  openCrew: (name: string) => `Crew ${name}`,
  profile: "Profil",
} as const;
