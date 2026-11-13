import { countFr } from "./plural.fr";

// Identification sur une photo d'album et « Tes photos » (lot R9f) : textes de la maquette R9 (`identH`, `plateauH`, `apparaisH`,
// `phsheetH`) au caractère près, plus les messages de l'API et les libellés absents de la maquette (consignés au journal des
// choix). Le « n° 12 » de la maquette n'existe pas : le plateau n'a pas de numéro. L'appli et le site lisent ici.

export const albumTagLabels = {
  // La visionneuse : qui je suis.
  mediaAuthor: "média auteur de l'album",
  eventOrganizer: "organisateur de l'événement",
  carOwnerPresent: "propriétaire d'une voiture présente",
  // La liste des identifiés.
  identifyCar: "Identifier une voiture",
  itsMyCar: "C'est ma voiture",
  carsIdentified: "Voitures identifiées",
  noCarIdentified: "Aucune voiture identifiée",
  pickInLineup: "Choisis la voiture dans le plateau",
  sayIfYours: "Si c'est ta voiture, dis-le",
  identifiedByYou: "identifiée par toi",
  identifiedBy: (name: string) => `identifiée par ${name}`,
  carIdentified: "Voiture identifiée.",
  canRemoveAnytime: "Tu peux retirer cette identification à tout moment.",
  isNotified: (name: string) => `${name} est prévenu : une notification pour l'album, pas une par photo.`,
  // Le plateau à choisir.
  searchPlaceholder: "Un nom, un pseudo, un numéro",
  all: "Toutes",
  you: "Toi",
  ownCarsOnly: "Seules tes voitures pointées présentes à l'événement sont proposées.",
  people: "Personnes",
  // La bannière de l'album ouvert.
  identifyCars: "Identifier les voitures",
  photosIdentified: (n: number, total: number) => `${n} sur ${total} photos identifiées`,
  continue: "Continuer",
  // La phrase gardée de la maquette, adaptée à la correction de Damien (on identifie aussi une personne par son pseudo).
  notAFace: "On identifie une voiture, pas un visage : seulement une voiture du plateau, ou un pseudo.",
  // « Tes photos ».
  myPhotos: "Tes photos",
  photosOfYourCar: (count: number, vehicle: string) => `${countFr(count, "photo")} de ta ${vehicle}`,
  photosWhereIdentified: (count: number) => `${countFr(count, "photo")} où tu es identifié`,
  contact: "Contacter",
  contactName: (name: string) => `Contacter ${name}`,
  messageAboutPhoto: "Un message à propos de cette photo",
  photoN: (n: number) => `Photo ${n}`,
  identifiedByYouCap: "Identifiée par toi",
  identifiedByCap: (name: string) => `Identifiée par ${name}`,
  inStory: "En story",
  save: "Enregistrer",
  saveNotAllowed: (name: string) => `Enregistrement non autorisé par ${name}`,
  withdrawMine: "Retirer mon identification",
  photoStaysWith: (name: string) => `La photo reste chez ${name}, ta voiture n'y est plus nommée`,
  notMyCar: "Ce n'est pas ma voiture",
  isNotifiedDeclined: (name: string) => `${name} en est prévenu ; l'identification disparaît`,
  report: "Signaler",
  awkwardOrPlate: "Photo gênante ou plaque lisible",
  seeMyPhotos: "Voir mes photos",
  notMentions: "Ces photos ne deviennent pas tes publications : ce sont des mentions de ta voiture, à part.",
  // La voiture, la sortie, le souvenir.
  seenAt: (event: string) => `Vu au ${event}`,
  seeCountPhotos: (count: number) => `Voir les ${count} photos`,
  photosOfMyCar: "Photos de ma voiture",
  reviewMyPhotos: "Revoir mes photos",
  // Notification (T40).
  taggedTitle: (media: string, count: number, vehicle: string, event: string) =>
    `${media} a publié ${countFr(count, "photo")} de ta ${vehicle} au ${event}`,
  taggedUserTitle: (media: string, count: number, event: string) =>
    `${media} t'a identifié sur ${countFr(count, "photo")} au ${event}`,
  taggedBody: (media: string, event: string) => `${media} · ${event} : ouvre « Tes photos ».`,
  declinedTitle: (who: string, album: string) => `${who} dit que ce n'est pas sa voiture · ${album}`,
  declinedUserTitle: (who: string, album: string) => `${who} dit que ce n'est pas lui sur cette photo · ${album}`,
  declinedWho: "Un propriétaire",
  // Absents de la maquette (journal des choix).
  privateAccount: "compte privé",
  noCheckinLineup: "Plateau sans pointage : toutes les voitures retenues",
  nobodyYet: "Personne n'est encore identifié sur cet album.",
  // Refus et erreurs de l'API.
  errors: {
    photoNotFound: "Photo introuvable",
    albumNotFound: "Album introuvable",
    tagNotFound: "Identification introuvable",
    notTaggable: "Introuvable",
    tagDeclined: "Cette personne a retiré son identification de cette photo : elle ne peut pas être reposée.",
    saveNotAllowed: "Le média n'autorise pas l'enregistrement de ses photos.",
    notIdentified: "Tu n'es pas identifié sur cette photo.",
    saveUnknownPlate: "Cette photo d'une ancienne galerie ne peut pas être enregistrée.",
    plateUnknown: "Cette photo d'une ancienne galerie ne peut pas être partagée en story.",
    reasonMismatch: "Ce motif ne correspond pas à cette identification.",
    notAccredited: "Tu n'es plus accrédité sur cet événement : tu ne peux plus identifier.",
  },
} as const;
