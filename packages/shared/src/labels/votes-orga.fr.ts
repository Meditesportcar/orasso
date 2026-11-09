// Votes à thème, côté organisateur et staff (lot R7l2, maquette R7.15 `v-prep` et R7.16 `v-live`) : les mots de l'étape
// « Votes du public » de l'éditeur, de la feuille « Nouveau vote » et de l'écran « Votes » (site et appli, mêmes mots).
// Les libellés du côté passionné et de l'API sont dans `votes.fr.ts`.
import type { VoteCandidateMode, VoteOpenMode } from "../rules/votes";
import { VOTE_PODIUM_POINTS_DEFAULT } from "../rules/votes";

const { first, second, third } = VOTE_PODIUM_POINTS_DEFAULT;

/** Les quatre manières de choisir les candidats (la maquette : « Quels candidats ? »). */
export const voteCandidateModeOptions: readonly {
  mode: VoteCandidateMode;
  label: string;
  hint: string;
  icon: "vehicle" | "flag" | "place" | "qr";
}[] = [
  { mode: "all", label: "Tous les véhicules entrés", hint: "Toute voiture entrée peut gagner", icon: "vehicle" },
  {
    mode: "origins",
    label: "Une origine, ou des marques",
    hint: "Les origines de l'éditeur d'événement, ou des marques",
    icon: "flag",
  },
  { mode: "zone", label: "Une zone du plateau", hint: "Zone JDM, zone exposition…", icon: "place" },
  {
    mode: "hand",
    label: "Choisis à la main",
    hint: "Par pseudo ou modèle, ou en scannant les QR des voitures",
    icon: "qr",
  },
];

/** Les trois manières d'ouvrir un vote (« Quand il ouvre »). */
export const voteOpenModeOptions: readonly {
  mode: VoteOpenMode;
  label: string;
  hint: string;
  icon: "check" | "wait" | "spark";
}[] = [
  { mode: "first_entry", label: "Dès les premières entrées", hint: "Comme le vote d'aujourd'hui", icon: "check" },
  { mode: "at", label: "À une heure fixée", hint: "Il s'ouvre tout seul à l'heure choisie", icon: "wait" },
  {
    mode: "manual",
    label: "Je le lance moi-même",
    hint: "Bouton « Lancer le vote », dans l'espace organisateur",
    icon: "spark",
  },
];

/** Les durées proposées (« Combien de temps ») ; `null` : jusqu'à la fin de l'événement, `"custom"` : au choix. */
export const voteDurationOptions: readonly { value: number | null | "custom"; label: string }[] = [
  { value: null, label: "Jusqu'à la fin de l'événement" },
  { value: 10, label: "10 min" },
  { value: 30, label: "30 min" },
  { value: 60, label: "1 h" },
  { value: "custom", label: "Au choix" },
];

export const voteOrgaLabels = {
  // --- Étape « Votes du public » de l'éditeur -------------------------------------------------------------------
  stepTitle: "Votes du public",
  stepIntro:
    "Le public vote pour ses voitures préférées. « Toutes catégories » est là d'office (tu peux le retirer). Ajoute autant de votes à thème que tu veux.",
  count: (n: number) => (n === 0 ? "Aucun vote prévu" : n === 1 ? "1 vote prévu" : `${n} votes prévus`),
  add: "Ajouter un vote",
  addAllCategories: "Remettre « Toutes catégories »",
  empty: "Aucun vote prévu : le public ne votera pour aucune voiture.",
  loadError: "Impossible de charger les votes.",
  retry: "Réessayer",
  loading: "Chargement…",
  needsEvent: "Les votes se préparent une fois l'événement enregistré : continue, puis reviens à cette étape.",
  stepNotBlocking: "Cette étape n'empêche pas de publier : les votes se préparent aussi pendant l'événement.",
  /** Les points viennent du réglage de l'administration (`VoteManage.podium`) ; à défaut, les valeurs provisoires. */
  pointsNote: (podium: readonly number[] = [first, second, third]) =>
    `Chaque vote donne des points à son podium : ${podium[0]} au 1er, ${podium[1]} au 2e, ${podium[2]} au 3e (réglage de l'administration). Le 1er reçoit un trophée sur la carte de sa voiture.`,
  podiumLine: (podium: readonly number[] = [first, second, third]) =>
    `${podium[0]} / ${podium[1]} / ${podium[2]} au podium`,
  stampNote: "« Toutes catégories » donne en plus le tampon rare au 1er.",
  teamNote:
    "Les votes sont prévus ici, ou lancés pendant l'événement. Seuls les organisateurs de la structure (propriétaire, co-organisateurs) les créent et les lancent.",
  tagStamp: "Tampon rare",
  tagDefault: "Là d'office",
  tagTrophy: "Trophée",

  // --- Une ligne de vote (étape) : « Japonaises · dimanche 12 h · jusqu'à la fin de l'événement » ---------------------
  candidatesAll: "Tous les véhicules entrés",
  candidatesOrigins: (what: string) => what,
  candidatesZone: (name: string) => `Zone ${name}`,
  candidatesHand: (n: number) =>
    n === 0 ? "Aucune voiture choisie" : n === 1 ? "1 voiture choisie à la main" : `${n} voitures choisies à la main`,
  openFirstEntry: "dès les premières entrées",
  openManual: "je le lance moi-même",
  openAt: (when: string) => when,

  // --- Menu d'un vote -------------------------------------------------------------------------------------------
  menu: "Plus",
  edit: "Modifier",
  remove: "Retirer",
  moveUp: "Monter",
  moveDown: "Descendre",
  removeTitle: (title: string) => `Retirer « ${title} » ?`,
  removeBody: "Le vote disparaît de l'événement. Un vote qui a déjà reçu des voix se clôt, il ne se retire pas.",
  removeConfirm: "Retirer le vote",
  keep: "Garder",

  // --- Feuille « Nouveau vote » ---------------------------------------------------------------------------------
  newTitle: "Nouveau vote",
  editTitle: "Modifier le vote",
  templates: "Un modèle, ou ton propre titre",
  titleField: "Titre du vote",
  candidatesQuestion: "Quels candidats ?",
  originsQuestion: "Quelles origines ?",
  makesSearch: "Ou des marques",
  makesPlaceholder: "Une marque, 2 lettres au moins",
  zoneQuestion: "Quelle zone ?",
  noZone: "Cet événement n'a pas encore de zone : ajoute-en une à l'étape « Lieu ».",
  entersOnly: "Seuls des véhicules entrés peuvent gagner.",
  handNote: "Les candidats se choisissent après l'ajout du vote : par recherche, ou en scannant leur QR le jour J.",
  whenQuestion: "Quand il ouvre",
  openAtField: "Date et heure d'ouverture",
  durationQuestion: "Combien de temps",
  customMinutes: "Durée en minutes",
  submitAdd: "Ajouter ce vote",
  submitSave: "Enregistrer le vote",
  close: "Fermer",
  handFirstEntry: "Un vote à la main se lance toi-même ou à une heure fixée.",
  problemTitle: "Donne un titre au vote",
  problemOrigins: "Choisis au moins une origine ou une marque",
  problemZone: "Choisis une zone",
  problemOpensAt: "Choisis une heure d'ouverture à venir, avant la fin de l'événement",
  problemDuration: "Indique une durée entre 1 minute et 7 jours",

  // --- Écran « Votes » pendant l'événement ----------------------------------------------------------------------
  screenTitle: "Votes",
  screenTitleStaff: "Votes",
  linkVotes: "Votes",
  linkVotesDirect: "Les votes du public",
  staffTile: "Votes",
  staffTileHint: "L'état des votes, en lecture seule",
  staffReadOnly:
    "Propriétaire et co-organisateurs de la structure lancent et closent les votes. Le staff les voit en lecture seule.",
  launch: "Lancer le vote",
  launchFor: (duration: string) => `Lancer · ${duration}`,
  closeNow: "Clore maintenant",
  closeTitle: (title: string) => `Clore « ${title} » ?`,
  closeBody: "Le vote est clos tout de suite : le classement devient public et le gagnant est prévenu.",
  closeConfirm: "Clore le vote",
  launchTitle: (title: string) => `Lancer « ${title} » ?`,
  launchBody:
    "Le vote s'ouvre tout de suite et une notification part aux personnes présentes. Plus rien ne change ensuite : on clôt, ou on lance un autre vote.",
  launchConfirm: "Lancer le vote",
  cancel: "Annuler",
  launched: "Vote lancé : une notification part aux présents.",
  closed: "Vote clos : le classement est public.",
  notEnoughShort: "moins de deux candidats entrés",
  notEnough: "Il faut deux candidats entrés au moins pour ouvrir ce vote.",
  notPublished: "Le vote se lancera après la publication de l'événement.",
  bell: "L'ouverture d'un vote à thème envoie une notification aux personnes présentes, qu'il soit lancé à la main, programmé à une heure ou ouvert dès les premières entrées (« Toutes catégories » n'en envoie pas). L'onglet « Votes » s'allume aussi. Chacun peut couper cette notification dans ses réglages.",
  rankingTitle: "Classement",
  rankingLive: "en direct, pour l'équipe",
  rankingStale: "classement à la dernière lecture réussie",
  /** Après une coupure, avec des données gardées : « Données d'il y a 3 min ». */
  staleData: (minutes: number) =>
    minutes < 1 ? "Données d'il y a moins d'une minute" : `Données d'il y a ${minutes} min`,
  rankingEmpty: "Pas encore de voix.",
  voiceCount: (n: number) => `${n} voix`,
  addVoteOnScreen: "Ajouter un vote",
  empty2: "Aucun vote pour cet événement.",

  // --- Candidats d'un vote « à la main » ------------------------------------------------------------------------
  candidatesTitle: "Candidats",
  candidatesButton: "Candidats",
  candidatesCount: (entered: number, total: number) =>
    total === entered
      ? `${total} ${total > 1 ? "voitures" : "voiture"}, ${total > 1 ? "toutes entrées" : "entrée"}`
      : `${entered} entrées sur ${total}`,
  candidatesNone: "Aucune voiture choisie pour l'instant.",
  retained: "retenue",
  retainedNotEntered: "Retenue · pas encore entrée",
  notEntered: "pas encore entrée",
  entered: "entrée",
  removeCandidate: "Retirer",
  addCandidate: "Ajouter",
  searchField: "Un pseudo ou un modèle, 2 lettres au moins",
  searchShort: "Saisis au moins deux lettres.",
  searchMore: "Voir plus de voitures",
  searchNone: "Aucune voiture retenue ne correspond.",
  searchError: "Recherche impossible pour l'instant.",
  scanButton: "Par QR",
  searchButton: "Recherche",
  lockedCandidates: "Le vote est ouvert : ses candidats ne changent plus.",
  scanTitle: "Ajouter par QR",
  scanHint: "Passe le code d'une voiture",
  scanNote:
    "La file du concours passe : tu scannes, les voitures sont candidates. Le scan ne vaut pas entrée : seule une voiture déjà entrée est ajoutée, les autres sont refusées.",
  scanDone: (n: number) => `Terminé · ${n} ${n > 1 ? "voitures" : "voiture"}`,
  scanAdded: (label: string, count: number) => `${label} · ajoutée · ${count} au total`,
  scanAlready: (label: string) => `${label} · déjà candidate`,
  scanSiteNote: "Le scan du QR des voitures se fait dans l'appli, avec l'appareil photo du téléphone.",
  scanNoCamera: "Pas de caméra dans le navigateur : saisis la charge utile du QR.",
  scanCameraOff: "Caméra non autorisée",
  scanAllow: "Autoriser la caméra",
  scanAim: "Caméra ouverte · vise le QR de la voiture",
  scanPayload: "Recette · charge utile",
  /** Refus de l'API affichés tels que l'organisateur les comprend. */
  scanRefusals: {
    not_checked_in: "Pas encore entrée : scanne-la à l'entrée d'abord.",
    invalid_qr: "Ce QR n'est pas un accès Orasso valable.",
    expired_qr: "Ce QR a expiré : demande à la personne de le rouvrir et scanne-le à nouveau.",
    other_event: "Ce QR est celui d'un autre événement.",
    vote_locked: "Le vote est ouvert : ses candidats ne changent plus.",
  } as Record<string, string>,
} as const;
