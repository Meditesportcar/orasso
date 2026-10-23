import type { VehicleStatus, VehicleType } from "../enums";

// Véhicules et garage.

export const vehicleTypeLabels: Record<VehicleType, string> = {
  car: "Voiture",
  moto: "Moto",
  truck: "Camion",
};

export const vehicleStatusLabels: Record<VehicleStatus, string> = {
  active: "Actif",
  sold: "Vendu",
  keepsake: "Souvenir",
  wrecked: "Accidenté",
};

/** Libellé de la ligne « Autre » du référentiel (marque, modèle, génération). */
export const OTHER_LABEL = "Autre";

/** Ajout de véhicule en cinq étapes, garage v2 et floutage de plaque (lot 51, prototype `s-vadd`, `s-garage`). */
export const vehicleWizardLabels = {
  title: "Ajouter un véhicule",
  editTitle: "Modifier le véhicule",
  steps: ["Marque et modèle", "Fiche technique", "Catégories", "Photos", "Plaque floutée"] as const,
  stepOf: (n: number, label: string) => `Étape ${n} sur 5 · ${label}`,
  next: "Continuer",
  previous: "Étape précédente",
  send: "Envoyer",
  save: "Enregistrer",
  // Étape 1
  identityTitle: {
    car: "Ta voiture, c'est quoi ?",
    moto: "Ta moto, c'est quoi ?",
    truck: "Ton camion, c'est quoi ?",
  } as Record<VehicleType, string>,
  identityText: "Marque, modèle, génération : tout vient de la liste Orasso, rien à taper en entier.",
  search: "Marque ou modèle",
  clearSearch: "Effacer",
  make: "Marque",
  model: "Modèle",
  generation: "Génération",
  other: "Autre",
  otherHint: "Pas dans la liste ? L'équipe Orasso l'ajoute à la base.",
  since: (year: number) => `depuis ${year}`,
  noMatch: "Rien dans la liste Orasso : choisis « Autre », l'équipe l'ajoute à la base.",
  // Étape 2
  specsTitle: "Sa fiche technique",
  specsText: "Motorisation, puissance et poids, année, couleur : la fiche que verront les organisateurs.",
  engine: "Motorisation",
  enginePlaceholder: "3.0 L6 turbo",
  power: "Puissance (ch)",
  weight: "Poids (kg)",
  year: "Année",
  color: "Couleur",
  colors: ["Blanche", "Noire", "Grise", "Rouge", "Bleue", "Jaune", "Orange", "Autre"] as const,
  // Étape 3
  categoriesTitle: "Ses catégories",
  categoriesText:
    "L'origine vient du pays de la marque. Choisis le reste : ce qui ne colle pas à ta voiture est grisé.",
  deducedFrom: (make: string) => `Déduit de ${make}`,
  styles: "Style · plusieurs choix",
  dimmedForYear: (labels: string, year: number) => `${labels} : grisées, ta voiture est de ${year}.`,
  // Étape 4
  photosTitle: "Ses photos",
  photosText: "Une à huit photos. L'étoile choisit la couverture de sa fiche.",
  photosAutoNote:
    "À l'étape suivante, tu vérifies la plaque de chaque photo : repérée par ton téléphone quand il le peut, sinon tu poses le cadre.",
  noPlate: "Envoyer sans flouter : aucune plaque visible",
  noPlateIssue: (n: number) =>
    `Photo ${n} : place le cadre sur la plaque, ou confirme « Envoyer sans flouter : aucune plaque visible ».`,
  plateInvalid: "Numéro de plaque invalide : lettres et chiffres, 3 au moins.",
  addPhoto: "Ajouter",
  photoCount: (n: number) => `${n} sur 8`,
  cover: "Couverture",
  makeCover: "Choisir comme couverture",
  plateBlurred: "Plaque floutée",
  photoRequired: "Ajoute au moins une photo : c'est la couverture de sa fiche.",
  // Étape 5
  plateTitle: "Sa plaque, floutée",
  plateText:
    "On repère la plaque sur tes photos et on la floute avant de publier. Pas d'accord ? Passe à la main et place le cadre.",
  auto: "Automatique",
  manual: "À la main",
  blurredCount: (n: number) => (n <= 1 ? `${n} plaque floutée` : `${n} plaques floutées`),
  placeFrame: "Place le cadre sur la plaque",
  addFrame: "Poser un cadre",
  removeFrame: "Retirer le cadre",
  // Lot 59c : poignées du cadre (lecteurs d'écran), cadre orientable.
  rotateFrame: "Tourner le cadre",
  resizeFrame: "Agrandir le cadre",
  frameHint: "Glisse le cadre sur la plaque, agrandis-le par son coin, tourne-le par sa poignée du haut.",
  detecting: "On cherche la plaque…",
  noPlateFound: "Aucune plaque repérée, passe à la main si besoin",
  noDetection: "Pas de repérage automatique ici : place le cadre à la main.",
  alreadyBlurred: "Plaque déjà floutée sur cette photo",
  photoN: (n: number, total: number) => `Photo ${n} sur ${total}`,
  previousPhoto: "Photo précédente",
  nextPhoto: "Photo suivante",
  irreversible: "Le flou est définitif : la photo part floutée, l'originale n'est gardée nulle part.",
  plateNumber: "Numéro de plaque · privé",
  formerTitle: "C'est un ancien véhicule",
  formerText: "Vendu, gardé en souvenir ou accidenté : la plaque devient facultative.",
  unregistered: "Véhicule non immatriculé",
  privacyNote:
    "Le numéro reste privé : seule l'équipe organisatrice le voit, pour vérifier ton inscription. Une plaque n'est active que sur un seul véhicule. Déjà enregistrée ? L'ancien propriétaire confirme le transfert.",
  plateRequired: "Indique le numéro de plaque, ou coche « C'est un ancien véhicule ».",
  // Lot M2 : numéro prérempli par la lecture de la photo (à confirmer), format étranger accepté sans blocage, « Envoyer
  // sans flouter » confirmé photo par photo.
  plateRead: "Lu sur ta photo : vérifie le numéro.",
  plateForeign: "Ce n'est pas un format français : vérifie le numéro. Une plaque étrangère est acceptée.",
  noPlateConfirmTitle: "Aucune plaque visible sur cette photo ?",
  noPlateConfirmBody: "Elle partira telle quelle, sans flou : vérifie qu'aucune plaque ne se voit, même au loin.",
  noPlateConfirm: "Oui, envoyer sans flouter",
  livePlate: "Plaque floutée, numéro privé",
  // Envoi et fin
  parkingTitle: "On la gare",
  uploading: (n: number, total: number) => `Envoi des photos : ${n} sur ${total}`,
  saving: "Enregistrement de la fiche…",
  resume: "Reprendre l'envoi",
  doneTitle: (name: string) => `Ta ${name} est au garage`,
  doneTitleEdit: "Fiche enregistrée",
  doneText: "Sa fiche est prête : plaque floutée, couverture choisie.",
  explore: "Découvrir les événements autour de moi",
  backToGarage: "Retour au garage",
  seeVehicle: "Voir sa fiche",
  // Garage v2
  garageTitle: "Mon garage",
  garageCount: (n: number) => (n <= 1 ? `${n} véhicule` : `${n} véhicules`),
  addVehicle: "Ajouter un véhicule",
  addVehicleHint: "Marque, photos, plaque floutée : deux minutes.",
  // Lot M5 : vocabulaire de Damien (« carte » = le plan seulement).
  share: "Partager son affiche",
  editVehicle: "Modifier le véhicule",
  events: "événements",
  audiencePrize: "Prix du public",
  certified: "Certifié",
  archived: (n: number) => `Archivés · ${n}`,
  emptyTitle: "Ton garage est vide",
  emptyText: "Ajoute ton premier véhicule : tu en auras besoin pour candidater.",
  needPhoto: "Ajoute une photo pour pouvoir candidater",
  // Floutage après coup (page du véhicule, site)
  blurAction: "Flouter la plaque",
  blurConfirm: "Flouter définitivement",
  sendPhoto: "Envoyer la photo",
  blurMore: "Flouter une autre zone",
  blurHelp:
    "Place le cadre sur la plaque, agrandis-le par le coin. Le flou est définitif : l'originale n'est gardée nulle part.",
  blurDone: "Plaque floutée.",
} as const;
