// Assistant de création et de modification d'un événement dans l'appli (lot 35b, D20), page de l'événement (publier,
// dupliquer, récurrence) et invitations complètes. Mêmes textes que l'assistant du site (`EventWizard.tsx`), découpés
// pour un écran de téléphone : une étape par écran.

/** Étapes de l'assistant de l'appli : celles du site, la première découpée en trois écrans (format, dates, lieu). */
export const appWizardSteps = [
  "format",
  "dates",
  "lieu",
  "vehicules",
  "places",
  "prestataires",
  "public",
  "admission",
  "criteres",
  "avant-premiere",
  "reglement",
  "infos",
  "zones",
  "billetterie",
] as const;
export type AppWizardStep = (typeof appWizardSteps)[number];

export const eventEditorLabels = {
  newTitle: "Nouvel événement",
  editTitle: "Modifier l'événement",
  create: "Créer un événement",
  edit: "Modifier",
  stepOf: (n: number, total: number, label: string) => `Étape ${n} sur ${total} · ${label}`,
  steps: {
    format: "Format",
    dates: "Dates",
    lieu: "Lieu",
    vehicules: "Véhicules",
    places: "Places",
    prestataires: "Prestataires",
    public: "Public",
    admission: "Admission",
    criteres: "Critères",
    "avant-premiere": "Avant-première",
    reglement: "Règlement",
    infos: "Infos",
    zones: "Zones",
    billetterie: "Billetterie",
  } satisfies Record<AppWizardStep, string>,
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
