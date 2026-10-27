import { type Grade, gradeLabels } from "../grades";
import type { LineupPhase } from "../rules/lineup";

// Le plateau (lot R4b, maquette R4.3, R4.3b, R4.4, R4.7) : mêmes mots dans l'appli et sur le site.

const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);

export const lineupLabels = {
  title: "Le plateau",
  /** Sous le titre du bloc : la règle de mise à jour. */
  caption: (phase: LineupPhase) => (phase === "present" ? "pointées à l'accueil" : "à jour à chaque acceptation"),
  /** « 42 voitures retenues », « 38 voitures présentes ». */
  cars: (n: number, phase: LineupPhase) =>
    phase === "present"
      ? `${plural(n, "voiture présente", "voitures présentes")}`
      : `${plural(n, "voiture retenue", "voitures retenues")}`,
  carsCount: (n: number, phase: LineupPhase) => `${n} ${lineupLabels.cars(n, phase)}`,
  prosOnSite: (n: number) => `et ${n} ${plural(n, "pro", "pros")} sur place`,
  /** Le bouton du bloc (lot R4b, tour 2) : le nombre est déjà écrit au-dessus, le bouton tient sur une ligne. */
  seeAll: "Voir le plateau",
  /** Bloc vide (validé par Damien) : le bloc reste, avec cette phrase. */
  empty: "Les premières voitures apparaîtront ici dès leur acceptation.",
  emptyCount: "0 voiture pour l'instant",
  /** Après l'événement, sans entrée pointée (les absents ne sont jamais montrés). */
  emptyPresent: "Aucune voiture pointée à l'accueil.",
  prosLabel: "Pros sur place",
  me: "Toi",
  tabCars: (n: number) => `Voitures · ${n}`,
  tabPros: (n: number) => `Pros · ${n}`,
  allCategories: "Toutes",
  more: (n: number) => `Voir ${plural(n, "l'autre", `les ${n} autres`)}`,
  /** En tête du plein écran, sous le grand nombre. */
  headAccepted: "À jour à chaque acceptation",
  headPresent: (day: string) => `Pointées à l'accueil le ${day}`,
  places: (n: number) => `${n} places`,
  /** La règle, en bas du plein écran. */
  rule: "Tout le monde y apparaît dès son acceptation, sans réglage. Les plaques sont toujours masquées et aucune heure d'arrivée n'est montrée. Un compte privé montre sa voiture et son pseudo ; son profil reste fermé.",
  prosNote: (organizer: string) =>
    `Les prestataires retenus par ${organizer} et les médias accrédités. Toucher ouvre leur vitrine.`,
  prosEmpty: "Aucun pro annoncé pour l'instant.",
  officialMedia: "Média officiel",
  mediaJob: "Média",
  /** « −8 % avec ton grade Route », « −10 % dès Sport ». */
  discount: (d: { percent: number; from: Grade | null }, mine: Grade) =>
    d.from ? `−${d.percent} % dès ${gradeLabels[d.from]}` : `−${d.percent} % avec ton grade ${gradeLabels[mine]}`,
  privateLock: "Compte privé",
  privateSheetTitle: (pseudo: string) => `La voiture de ${pseudo}`,
  privateSheetNote: (pseudo: string) =>
    `${pseudo} a un compte privé : son profil, son garage et ses sorties sont réservés à ses abonnés. Sa voiture et son pseudo restent visibles sur le plateau.`,
  plateMasked: "plaque masquée",
  askFriend: "Demander à suivre",
  friendSent: "Demandé",
  /** Site sans compte (validé par Damien) : photos et modèles sans pseudo. */
  visitorTitle: "Qui vient ?",
  visitorText: "Les pseudos et les profils sont réservés aux membres.",
  visitorLogin: "Connecte-toi",
  visitorSignup: "ou crée ton compte en une minute.",
  /** Site : « Voir les 42 voitures ». */
  siteSeeAll: (n: number) => `Voir ${plural(n, "la voiture", `les ${n} voitures`)}`,
  siteOnSite: "Sur place",
  /** Bloc de droite du site : « 42 retenus ». */
  kpiAccepted: (n: number) => plural(n, "retenu", "retenus"),
  kpiPresent: (n: number) => plural(n, "présente", "présentes"),
  /** Ligne d'un ticket de Mes sorties : « Le plateau · 42 voitures », « · 38 présentes ». */
  sortiesLine: (n: number, phase: LineupPhase) =>
    `${phase === "present" ? plural(n, "présente", "présentes") : plural(n, "voiture", "voitures")}`,
  backToEvent: "Retour à la fiche",
  previous: "Voir les précédentes",
  /** Lot R4b, tour 2 : la relecture a échoué (coupure) ; la liste montrée est la dernière reçue. */
  stale: "Pas de réseau : le plateau n'est peut-être pas à jour.",
  /** Site : 429 de la route du plateau. */
  tooMany: "Trop de demandes, réessaie dans un instant.",
  loadError: "Le plateau n'a pas pu être chargé.",
  retry: "Réessayer",
} as const;
