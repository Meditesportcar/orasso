// Assistant de création et de modification d'un événement (site et appli, lot 53 : huit temps de `s-create`), page de
// l'événement (publier, dupliquer, récurrence) et invitations complètes. Mêmes textes sur le site (`EventWizard.tsx`)
// et dans l'appli (`features/orga/wizard`).
import type { EventWizardStep } from "../eventWizard";

/** Nom court de chaque temps (barre de progression, « Étape 2 sur 8 · Lieu »). */
export const eventStepLabels: Record<EventWizardStep, string> = {
  type: "Type",
  lieu: "Lieu",
  arrivees: "Arrivées",
  criteres: "Critères",
  "avant-premiere": "Avant-première",
  reglement: "Règlement",
  affiche: "Affiche",
  publier: "Tout est prêt",
};

export const eventEditorLabels = {
  newTitle: "Nouvel événement",
  editTitle: "Modifier l'événement",
  create: "Créer un événement",
  edit: "Modifier",
  stepOf: (n: number, total: number, label: string) => `Étape ${n} sur ${total} · ${label}`,
  steps: eventStepLabels,
  next: "Suivant",
  back: "Retour",
  cancel: "Annuler",
  saveDraft: "Enregistrer le brouillon",
  saveChanges: "Enregistrer les modifications",
  saving: "Enregistrement…",

  // Brouillon gardé sur le téléphone.
  draftResumeTitle: "Brouillon en cours",
  draftResume: (title: string, when: string) => `${title || "Sans titre"} · commencé ${when}. Le reprendre ?`,
  draftResumeYes: "Reprendre",
  draftResumeNo: "Recommencer",
  draftKept: "Brouillon gardé sur ce téléphone : tu le retrouves en revenant.",
  quitTitle: "Quitter l'assistant ?",
  quitBody: "Ta saisie reste sur ce téléphone : tu la retrouves en revenant sur « Créer un événement ».",
  quitEditBody: "Les modifications non enregistrées sont perdues.",
  quitConfirm: "Quitter",
  quitKeep: "Continuer",

  // Format.
  format: "Format",
  title: "Titre",
  description: "Description et programme",

  // Dates.
  startDate: "Date de début",
  startTime: "Heure de début",
  endDate: "Date de fin",
  endTime: "Heure de fin",
  date: "Date",
  start: "Début",
  end: "Fin",
  datePlaceholder: "AAAA-MM-JJ",
  timePlaceholder: "HH:MM",
  datesHint: "Heure de Paris.",
  /** Lot 34 : sélecteur natif de date et d'heure de l'appli (iOS : roue sous le champ, à refermer). */
  pickerDone: "Valider",

  // Lieu.
  addressLine: "Adresse",
  postalCode: "Code postal",
  city: "Ville",
  checkAddress: "Vérifier l'adresse",
  useMyPosition: "Utiliser ma position",
  addressSearching: "Recherche…",
  addressTooShort: "Saisis d'abord une adresse.",
  addressNotFound: "Adresse introuvable : l'événement ne s'affichera pas sur la carte.",
  addressFound: (label: string) => `Trouvée : ${label}`,
  positionSaved: "Position enregistrée.",
  positionFromDevice: "Position du téléphone enregistrée : complète l'adresse affichée aux participants.",
  positionFilled: (label: string) => `Position du téléphone : ${label}`,
  positionDenied: "Position indisponible : autorise la localisation ou saisis l'adresse.",
  addressPublic: "L'adresse est publique et placée sur la carte.",

  // Véhicules.
  vehicleTypes: "Véhicules admis",
  maxVehicles: "Véhicules par personne, au plus",
  maxVehiclesHint: "Une même personne peut inscrire plusieurs véhicules ; chacun reçoit sa propre décision.",

  // Places.
  capacityTitle: "Nombre de places",
  unlimited: "Sans limite",
  limited: "Avec une limite",
  capacityHint:
    "Même sans limite, tu vois le nombre d'inscrits en temps réel. La liste d'attente automatique ne joue que quand il y a une limite.",

  // Prestataires.
  vendorsIntro:
    "Coche les types de prestataires que tu accueilles : seuls ceux-là peuvent candidater, et tu les tries dans l'onglet « Prestataires » du tri, hors places. « Autres » accepte aussi les types que tu ajoutes avec « Un autre type ».",
  vendorsTitle: "Prestataires attendus",
  customVendor: "Un autre type",
  add: "Ajouter",

  // Public.
  publicTitle: "Entrée du public",
  paymentTitle: "Paiement de l'entrée",
  paymentLink: "Lien de billetterie",
  paymentOnSite: "Paiement sur place",
  ticketUrl: "Adresse de ta billetterie",
  onSiteHint: (label: string) => `Pas de billetterie en ligne : la page affichera « ${label} ».`,
  freeReservationHint: "Chaque visiteur réserve un billet gratuit avec son QR, contrôlé à l'entrée. ",
  paidOrassoHint:
    "Billetterie payante en mode présentation : le paiement se fait avec Stripe en mode test, aucun encaissement réel avant le 21 juin 2027. ",
  ticketingLater: (paid: boolean) =>
    `Tu règles les places${paid ? ", le prix" : ""} et l'ouverture de la billetterie sur la page de l'événement, une fois le brouillon enregistré.`,

  // Admission.
  admissionTitle: "Mode d'admission",
  admissionOpen: "Tout le monde est retenu d'office, dans la limite des places.",
  admissionInvite:
    "Événement privé : il n'apparaît nulle part et seuls tes invités le voient. Tu invites des personnes, des véhicules ou des adresses e-mail depuis la page de l'événement, une fois publié.",
  admissionFiltered: "Tu trieras les candidatures une à une ou en liste, avec ton équipe de filtration.",

  // Critères.
  criteriaIntro:
    "Les critères sont affichés aux candidats et t'aident à trier : ils ne refusent personne automatiquement.",
  categories: "Catégories recherchées",
  countries: "Origine",
  makes: "Marques",
  makesSearch: "Chercher une marque",
  makesChosen: (n: number) => `${n} marque${n > 1 ? "s" : ""} retenue${n > 1 ? "s" : ""}`,
  criteriaText: "Précisions",
  criteriaTextHint: "Par exemple : « véhicules d'avant 2000, préparations sobres ».",

  // Avant-première.
  registrationsOpenAt: "Ouverture des inscriptions",
  registrationsDate: "Date d'ouverture",
  registrationsTime: "Heure d'ouverture",
  previewHours: "Avant-première des abonnés",
  previewHoursHint: "Les abonnés de ta structure peuvent candidater avant l'ouverture publique.",
  lockOffset: "Verrouillage des inscriptions",
  lockOffsetHint: "À ce moment, le staff synchronise la liste d'accès et les désistements deviennent des absences.",

  // Règlement.
  rulesTemplate: "Utiliser le modèle Orasso",
  rules: "Règlement",
  rulesHint:
    "Le modèle d'Orasso est un point de départ ; tu peux le modifier ou écrire ton propre texte. Les candidats l'acceptent en candidatant.",

  // Infos.
  instructions: "Consignes aux retenus",
  instructionsHint: "Réservées aux participants retenus : accès, horaires d'arrivée, ce qu'il faut apporter.",
  poster: "Affiche",
  posterPick: "Choisir l'affiche",
  posterReplace: "Remplacer l'affiche",
  posterRemove: "Ne pas changer l'affiche",
  posterChosen: "Affiche choisie : elle sera envoyée à l'enregistrement.",
  posterCurrent: "Affiche actuelle",
  posterHint: "Une image de ta photothèque (JPEG).",

  // Zones.
  zonesIntro: "Les zones (A, JDM…) s'affichent en grand au scan et guident le placement. Tu peux n'en créer aucune.",
  zoneCode: "Code",
  zoneName: "Nom",
  zoneCapacity: "Places",
  zoneRemove: "Retirer",
  zoneAdd: "Ajouter une zone",
  zone: (n: number) => `Zone ${n}`,

  // Billetterie et récapitulatif.
  ticketingNoticeOrasso:
    "Une fois le brouillon enregistré, ouvre la billetterie des visiteurs (places, prix, interrupteur) depuis la page de l'événement.",
  ticketingNoticeOther:
    "La billetterie Orasso (billets gratuits sur réservation, billets payants en mode présentation) se choisit à l'étape « Public ».",
  staffTitle: "Staff de l'événement",
  recapTitle: "Récapitulatif",
  recap: {
    format: "Format",
    title: "Titre",
    start: "Début",
    address: "Adresse",
    vehicles: "Véhicules",
    places: "Places",
    public: "Public",
    admission: "Admission",
    zones: "Zones",
    none: "Aucune",
  },
  notVerified: "Ta structure n'est pas encore vérifiée : tu peux enregistrer ce brouillon, mais pas le publier.",
  publishedWarning: "Cet événement est publié : si tu changes la date ou l'adresse, tous les inscrits sont prévenus.",
  created: "Brouillon enregistré.",
  createdVerified: "Publie-le quand il est prêt.",
  createdNotVerified: "Fais vérifier ta structure pour pouvoir le publier.",
  saved: "Modifications enregistrées.",
  savedPartly: (what: string) => `Événement enregistré, mais ${what} : réessaie depuis « Modifier ».`,
  posterFailed: "l'affiche n'a pas été envoyée",
  zonesFailed: "une zone n'a pas été enregistrée",
  startedLocked: "L'événement a commencé : il ne se modifie plus.",

  // Page de l'événement : publier, dupliquer, récurrence.
  manageTitle: "Gérer",
  publish: "Publier l'événement",
  publishTitle: "Publier l'événement ?",
  publishBody:
    "L'événement devient visible sur la liste des événements et sa page publique ; les inscriptions s'ouvrent à la date prévue.",
  publishBlocked: "La publication est réservée aux structures vérifiées.",
  publishBlockedLink: "Faire vérifier ma structure",
  published: "Événement publié : il est visible sur la liste des événements.",
  duplicate: "Dupliquer",
  duplicateTitle: "Dupliquer l'événement ?",
  duplicateBody: "Une copie est créée en brouillon, avec les mêmes réglages ; tu la modifies ensuite (dates, lieu…).",
  duplicateConfirm: "Créer la copie",
  duplicated: "Copie créée en brouillon : vérifie les dates puis enregistre.",
  recurrenceTitle: "Récurrence",
  recurrenceIntro:
    "Un événement qui revient (chaque premier dimanche du mois, par exemple) se crée une seule fois : les dates suivantes sont générées en brouillon.",
  recurrenceKind: "Répétition",
  recurrenceMonthly: "Chaque mois, le même jour de la semaine",
  recurrenceWeekly: "Toutes les N semaines",
  recurrenceEvery: "Toutes les",
  recurrenceWeeks: (n: number) => (n === 1 ? "semaine" : `${n} semaines`),
  recurrenceNth: "Chaque",
  recurrenceWeekday: "Jour",
  recurrenceCount: "Nombre d'occurrences à créer",
  recurrenceCountHint: "Créées en brouillon, une seule fois. Chacune se modifie ensuite séparément.",
  recurrenceNone: "aucune date",
  recurrenceCreate: "Créer la série",
  recurrenceConfirmTitle: "Créer la série ?",
  recurrenceConfirm: (n: number) =>
    `${n} brouillon${n > 1 ? "s" : ""} ser${n > 1 ? "ont" : "a"} créé${n > 1 ? "s" : ""}, une seule fois.`,
  recurrenceDone: (n: number) => `${n} occurrence${n > 1 ? "s" : ""} créée${n > 1 ? "s" : ""} en brouillon.`,
  nth: { 1: "premier", 2: "deuxième", 3: "troisième", 4: "quatrième", [-1]: "dernier" } as Record<number, string>,
  nextEditionDuplicated: "Copie créée en brouillon : règle les dates de l'édition suivante.",
  vendorsExpected: "Prestataires attendus",
  vendorsSort: "Trier les prestataires",
  publicPage: "Page publique",
  draftNotice: "Brouillon : termine-le avec « Modifier », puis publie-le.",

  // Invitations complètes.
  invitedAlready: "déjà invité",
  candidatePast: "retenu d'une édition passée",
  candidateFollower: "abonné",
  invitationsSelected: (n: number) => `${n} véhicule${n > 1 ? "s" : ""} choisi${n > 1 ? "s" : ""}`,
  removeTitle: "Retirer l'invitation ?",
  removeBody: "L'invitation en attente est retirée : la personne ne peut plus l'accepter.",
  removed: "Invitation retirée.",
  fromEventTitle: "Inviter les retenus ?",
  fromEventBody: (title: string, n: number) =>
    `Les ${n} retenus de « ${title} » reçoivent une invitation (déjà invités et bannis exceptés).`,
  previousEdition: "Édition précédente",
  invitedNotice: "Chaque invité reçoit une notification ; une adresse sans compte reçoit un e-mail.",
  lockedInvitations: "Inscriptions verrouillées : les invitations ne sont plus possibles.",
  publishToInvite: "Publie l'événement pour inviter.",
} as const;

/**
 * Assistant en huit temps (lot 53) : textes du prototype DA v2 (`s-create`, `data-cs="0"` à `"7"`), au « tu », sans
 * genre. Les volets « Public et places », « Sur place » et « Public » regroupent les étapes de l'ancien assistant
 * (véhicules, places, prestataires, zones, missions, entrée du public, billetterie) sans rien retirer.
 */
export const wizardV2Labels = {
  flowSub: (structure: string) => `${structure} · enregistré à chaque étape`,
  close: "Fermer",
  continue: "Continuer",
  previous: "Étape précédente",

  // (1) Type.
  typeTitle: "C'est quel genre ?",
  typeIntro: "Le format préremplit les options. Tout reste modifiable.",
  howOften: "Combien de fois ?",
  kinds: {
    one: { title: "Ponctuel", hint: "Une date, un soir ou une journée" },
    rec: { title: "Récurrent", hint: "Le même rendez-vous, plusieurs dates" },
    multi: { title: "Plusieurs jours", hint: "Un week-end, un salon" },
  },
  date: "Date",
  start: "Début",
  end: "Fin",
  returns: "Revient",
  nthChips: { 1: "Le 1er", 2: "Le 2e", 3: "Le 3e", 4: "Le 4e", [-1]: "Le dernier" } as Record<number, string>,
  weekdayChips: ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"] as const,
  eachMonth: "de chaque mois",
  from: "De",
  to: "À",
  nextDates: "Prochaines dates",
  until: "Jusqu'au",
  untilValue: (date: string) => `${date}, puis à reconduire`,
  recurrenceCount: "Nombre de dates après la première",
  recurrenceExisting: "Cette série existe déjà : ses dates se modifient une à une, depuis Événements.",
  eventTitle: "Titre",
  eventDescription: "Description et programme",
  placesPanel: "Public et places",
  placesPanelHint: "Véhicules admis, nombre de places",

  // (2) Lieu.
  placeTitle: "Où ça se passe ?",
  placeIntro: "Obligatoire pour publier. Déplace l'épingle pour viser l'entrée exacte.",
  search: "Adresse",
  searchPlaceholder: "ex. Port de Canet",
  searchButton: "Chercher",
  suggestionsNone: "Aucune adresse trouvée : complète l'adresse et la ville, puis place l'épingle à la main.",
  coords: (lat: number, lng: number) =>
    `${Math.abs(lat).toFixed(4).replace(".", ",")} ${lat >= 0 ? "N" : "S"} · ${Math.abs(lng).toFixed(4).replace(".", ",")} ${lng >= 0 ? "E" : "O"}`,
  pinMissing: "Pas encore d'épingle : cherche l'adresse, ou touche la carte à l'endroit de l'entrée.",
  entrance: "Précision pour l'entrée (facultatif)",
  entrancePlaceholder: "ex. Entrée par le quai Nord, barrière levée à 18 h",
  onSitePanel: "Sur place",
  onSitePanelHint: "Zones, prestataires attendus, missions",
  missionsTitle: "Missions",
  missionsIntro:
    "Ce que tu cherches : un food truck, un photographe… Les prestataires voient la mission, ce que tu fournis, et candidatent dessus.",
  missionTrade: "Métier",
  missionQuantity: "Combien",
  missionPower: "Électricité fournie",
  missionWater: "Eau sur place",
  missionFrontage: "Façade (mètres)",
  missionInstall: "Installation à partir de",
  missionAdd: "Ajouter une mission",
  missionRemove: "Retirer",
  mission: (n: number) => `Mission ${n}`,

  // (3) Arrivées.
  arrivalsTitle: "Les arrivées",
  arrivalsIntro:
    "Un créneau pour les exposants, un pour le public. Les retenus le reçoivent dans leurs consignes et confirment l'avoir vu.",
  arrivalsNone: "Pas de créneau",
  arrivalsSet: "Fixer un créneau",
  advisedHint: "Recommandé : une indication, personne n'est refusé en arrivant plus tard.",
  exhibitorSees: "Ce que voit l'exposant en candidatant",
  exhibitorSeesBody: "Il coche « J'ai vu » et peut laisser une note : « J'arriverai vers 19 h 30 à cause du travail ».",
  exhibitorSeesNone: "Aucun créneau : l'exposant ne voit pas d'horaire d'arrivée.",
  publicPanel: "Public",
  publicPanelHint: "Entrée du public, billets",
  ticketsTitle: "Billetterie visiteurs",

  // (4) Critères.
  criteriaTitle: "Qui peut venir ?",
  criteriaIntro: "Trois questions, dans l'ordre. Laisse vide pour tout accepter.",
  admission: "Admission",
  q1: "Quelles origines ?",
  q2: "Quels styles ?",
  q3: "Des marques en particulier ?",
  makesPlaceholder: "ex. Porsche, Nissan",
  makesNone: "Aucune : toutes les marques des origines choisies.",
  criteriaMore: "Précisions (facultatif)",

  // (5) Avant-première.
  previewTitle: "Avant-première",
  previewIntro: "Récompense tes abonnés : ils candidatent avant tout le monde.",
  previewSwitch: "Tes abonnés peuvent candidater en avance",
  followers: (n: number, structure: string) => `${n} abonné${n > 1 ? "s" : ""} à ${structure}`,
  previewLead: "Combien de temps avant",
  openSubscribers: "Ouverture aux abonnés",
  openEveryone: "Ouverture à tous",
  timelineSubscribers: "abonnés",
  timelineEveryone: "tout le monde",
  morePanel: "Hauts grades et verrouillage",

  // (6) Règlement.
  rulesTitle: "Le règlement",
  rulesIntro: "Écris sur autant de lignes que tu veux. Il s'affiche tel quel sur la page de l'événement.",
  rulesOrasso: "Modèle Orasso",
  rulesLast: "Reprendre le dernier",
  rulesLastNone: "Aucun règlement précédent à reprendre.",
  rulesInserted: "Modèle inséré",
  rulesTaken: (title: string) => `Règlement repris de « ${title} »`,
  rulesCount: (lines: number, chars: number) =>
    `${lines} ligne${lines > 1 ? "s" : ""} · ${chars} caractère${chars > 1 ? "s" : ""}`,

  // (7) Affiche.
  posterTitle: "Ton affiche",
  posterPhotoPick: "Choisir une photo",
  posterPhotoChange: "Changer de photo",
  posterNoPhoto: "Sans photo, l'affiche prend le style Minimal aux couleurs du format.",
  posterSending: "Envoi de la photo…",
  posterPreviewAlt: "Aperçu de l'affiche",
  posterTitleField: "Titre sur l'affiche",
  posterOwnTitle: "Tu as déjà ton affiche ?",
  posterOwnHint: "Ajoute-la en plus. Elle s'affiche dans le détail de l'événement.",
  posterOwnChosen: (name: string) => `Affiche perso choisie : ${name}`,

  // (8) Tout est prêt.
  readyTitle: "Tout est prêt",
  readyIntro: "Vérifie, puis choisis.",
  publish: "Publier",
  draft: "Brouillon",
  preview: "Aperçu",
  recapExhibitors: (n: number) => `${n} exposant${n > 1 ? "s" : ""}`,
  recapNoLimit: "Places sans limite",
  recapPreview: (date: string) => `Avant-première ${date}`,
  recapNoPreview: "Sans avant-première",
  recapRecurrence: (n: number) => `${n} date${n > 1 ? "s" : ""} de plus, en brouillon`,

  // Corrections des relectures du lot 53 (21/10/2026).
  posterRequired: "Choisis ton affiche avant de publier.",
  recurrenceDraftOnly: "Une série se crée depuis un brouillon. Pour d'autres dates, duplique l'événement.",
  arrivalsCleared: (which: string) =>
    `Le créneau d'arrivée ${which} ne tombait plus dans les horaires : il est retiré. Refais-le au temps « Les arrivées ».`,
  arrivalsClearedWho: { exhibitors: "des exposants", public: "du public" } as Record<string, string>,
  savedRefused: (what: string[]) =>
    `Brouillon enregistré, sauf ${what.join(", ")} : la saisie est gardée, touche « Continuer » pour renvoyer.`,
  refusedZone: (code: string) => `la zone ${code || "sans code"}`,
  refusedMission: (n: number) => `la mission ${n}`,
  refusedRemoval: "une suppression",
  refusedPoster: "l'affiche perso",
  seriesFailed: (message: string) =>
    `Les dates suivantes n'ont pas été créées (${message}). La règle est gardée : réessaie.`,
  rulesReplaceTitle: "Remplacer ton règlement ?",
  rulesReplaceBody: (what: string) => `Le texte saisi sera remplacé par ${what}.`,
  rulesReplaceConfirm: "Remplacer",
  rulesReplaceKeep: "Garder le mien",
  rulesWhatTemplate: (label: string) => `le « ${label} »`,
  rulesWhatLast: "le règlement de ton dernier événement",
  posterPreviewFailed: "Les aperçus n'ont pas pu être rendus (limite atteinte ou réseau) : réessaie dans une minute.",
  posterPreviewRetry: "Réessayer",
  quitDraftBody: "Ta saisie reste sur ce téléphone : tu la retrouves en rouvrant ce brouillon.",
  missionDay: (n: number) => (n === 1 ? "Installation le lendemain" : `Installation ${n} jours plus tard`),

  // Correctif 53c (21/10/2026).
  needsLoading: "Les missions de l'événement se chargent : attends un instant avant d'enregistrer.",
  needsFailed: "Les missions de l'événement n'ont pas pu être chargées : rien n'est enregistré tant qu'elles manquent.",
  needsRetry: "Recharger les missions",
  posterStillSending: "La photo de l'affiche s'envoie encore : attends la fin de l'envoi.",
} as const;

/** Modèles de règlement (`s-create` : « Modèle Nocturne », « Modèle Expo » ; le modèle d'Orasso reste proposé). */
export const rulesTemplates = [
  {
    id: "nocturne",
    label: "Modèle Nocturne",
    text: [
      "Départs au pas, aucun burn ni rupteur : exclusion immédiate.",
      "Musique coupée après 22 h, par respect pour les riverains.",
      "Chacun repart avec ses déchets, des sacs sont prévus à l'entrée.",
      "Les mineurs viennent accompagnés.",
    ].join("\n"),
  },
  {
    id: "expo",
    label: "Modèle Expo",
    text: [
      "Arrivée dans le créneau indiqué ; le placement suit les consignes du staff.",
      "Moteurs coupés dans l'enceinte, aucune démonstration sonore.",
      "Le véhicule reste exposé jusqu'à la fermeture, sauf accord de l'organisation.",
      "Chacun repart avec ses déchets.",
    ].join("\n"),
  },
] as const;

/**
 * Origines du critère « Quelles origines ? » (codes ISO des pays des marques), dans l'ordre du prototype : chip au
 * singulier, forme de la phrase récapitulative au pluriel.
 */
export const criteriaOrigins = [
  { code: "JP", chip: "Japonaise", plural: "japonaises" },
  { code: "DE", chip: "Allemande", plural: "allemandes" },
  { code: "FR", chip: "Française", plural: "françaises" },
  { code: "IT", chip: "Italienne", plural: "italiennes" },
  { code: "US", chip: "Américaine", plural: "américaines" },
  { code: "GB", chip: "Britannique", plural: "britanniques" },
  { code: "SE", chip: "Suédoise", plural: "suédoises" },
  { code: "ES", chip: "Espagnole", plural: "espagnoles" },
] as const;
