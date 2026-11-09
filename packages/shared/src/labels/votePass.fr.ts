// Votes à thème, côté passionné (lot R7l3, maquette R7.17 `v-pass` et R7.18 `v-troph`) : les mots de la liste des votes, de
// la grille d'un concours, du classement, de la carte « Résultat » et des trophées de la carte d'un véhicule. Site et
// appli, mêmes mots. Les libellés de l'API (erreurs, notifications) sont dans `votes.fr.ts`.
import { countFr, pluralFr } from "./plural.fr";

export const votePassTexts = {
  /** Titre de la liste : « Votes », puis « Votes · 3 ouverts » s'il y en a. */
  listTitle: "Votes",
  listOpen: (n: number) => `Votes · ${n} ${pluralFr(n, "ouvert", "ouverts")}`,
  listEmpty: "Aucun vote pour cet événement.",
  listLoadFailed: "Impossible de charger les votes : vérifie ta connexion.",
  retry: "Réessayer",
  staleData: (minutes: number) =>
    minutes < 1 ? "Données d'il y a moins d'une minute" : `Données d'il y a ${minutes} min`,
  loading: "Chargement…",
  /** Les deux notes sous la liste (maquette). */
  ruleNote: "Une voix par vote, modifiable jusqu'à la clôture, jamais pour ta propre voiture.",
  rankingNote: "Le classement s'affiche après ton vote ; pour tous, à la clôture.",
  whoVotes:
    "Tu peux voter si tu es entré avec un véhicule, si ton billet est contrôlé, si tu es staff présent, ou si ta présence est validée par GPS.",

  // --- Une ligne de la liste ---------------------------------------------------------------------------------------
  chipVoted: "Voté",
  chipVote: "Voter",
  chipSoon: "À venir",
  chipResults: "Résultats",
  chipOpen: "Ouvert",
  cars: (n: number) => countFr(n, "voiture"),
  /** « 8 min restantes » (moins d'une heure) ; « Moins d'une minute restante » sous la minute. */
  minutesLeft: (minutes: number) =>
    minutes < 1 ? "Moins d'une minute restante" : `${minutes} ${pluralFr(minutes, "min restante", "min restantes")}`,
  closesWhen: (when: string) => `ferme ${when}`,
  opensWhen: (when: string) => `Ouvre ${when}`,
  opensWhenTwoCars: "Ouvre dès deux voitures entrées",
  opensLater: "Ouverture à venir",
  openLabel: "Ouvert",
  myVoteLine: (label: string) => `Ta voix : ${label}`,
  myVoteSaved: "Ta voix est enregistrée",
  closedSeeRanking: "Clos · voir le classement",
  /** Qui ne peut pas voter : ce qu'il lui manque. `visitor` : aucune candidature sur cet événement. */
  enterToVote: "Entre sur l'événement pour voter",
  validatePresence: "Valide ta présence pour voter",

  // --- La carte « Résultat » (liste) ------------------------------------------------------------------------------
  resultTitle: "Résultat",
  resultVotes: (n: number) => countFr(n, "voix"),
  podium: ["1er", "2e", "3e"] as const,
  noPodium: "Pas de podium : il faut au moins 2 voitures et 3 voix.",

  // --- Un vote -----------------------------------------------------------------------------------------------------
  voteScreenTitle: "Vote",
  chooseCta: "Choisis une voiture",
  pickCta: (label: string) => `Voter pour ${label}`,
  change: "Changer mon vote",
  backToRanking: "Retour au classement",
  notYetEntered: "Pas encore entrée",
  youTag: "Toi",
  you: "C'est toi",
  yourVote: "Ton vote",
  number: (n: number) => `N° ${n}`,
  oneVote: "Une voix, une seule",
  /** Bandeau d'un vote ouvert : « 8 min restantes · ferme à 13 h 22 ». */
  openBanner: (left: string | null, closes: string) => (left ? `${left} · ferme ${closes}` : `Ferme ${closes}`),
  rulesLine: "Une voix, pas pour toi-même, modifiable jusqu'à la clôture.",
  rankingAfterVote: "Le classement s'affiche après ton vote.",
  rankingAtClose: "Le classement s'affiche à la clôture du vote.",
  rankingLoading: "Chargement du classement…",
  /** Le vote est affiché (réponse à ma voix, ou dernière lecture) mais la relecture a échoué. */
  refreshFailed: "Ce vote ne s'actualise pas : vérifie ta connexion.",
  loadFailed: "Impossible de charger ce vote : vérifie ta connexion.",
  saved: (closes: string) => `Vote enregistré · tu peux le changer ${closes}`,
  notOpen: "Ce vote n'est pas encore ouvert.",
  closedNote: "Ce vote est clos.",
  ranking: "Classement",
  live: "En direct",
  votes: (n: number) => countFr(n, "vote"),
  rank: (rank: number, of: number) => `${rank === 1 ? "1er" : `${rank}e`} sur ${of}`,
  winner: "Gagnante",
  winnerLine: (votes: number, total: number) => `Gagnante · ${votes} sur ${total}`,
  empty: "Aucune voiture ne concourt encore.",
  seeAllVotes: "Tous les votes",
  seeEvent: "Voir l'événement",
  closedResultNote:
    "Le classement complet est public à la clôture. Le gagnant reçoit une notification et un trophée sur la carte de sa voiture.",
} as const;

/** Les trophées de la carte d'un véhicule (maquette R7.18 `vr_car`). */
export const vehicleTrophyTexts = {
  title: "Trophées",
  byThePublic: "décernés par le public",
  /** Badge sur la photo : « 2 trophées ». */
  badge: (n: number) => countFr(n, "trophée"),
  rank: (rank: number) => (rank === 1 ? "1er" : `${rank}e`),
  partnerTitle: (name: string) => `Partenaire : ${name}`,
} as const;
