// L'onglet « Publications » d'un profil, la page d'une publication seule, « Mes publications » (vague R8, lot R8b2, maquette
// R8.1 `pr-profil` et R8.6 `pu-publi`). Appli et site disent les mêmes mots, copiés de la maquette au caractère près.
import { countFr } from "./plural.fr";

export const publicationsLabels = {
  /** L'en-tête de la liste : « 9 publications ». */
  count: (n: number) => countFr(n, "publication"),
  /** La bascule des deux vues : son nom accessible et celui de chaque bouton. */
  viewGroup: "Affichage",
  viewGrid: "Grille de deux",
  viewOne: "Une par une",
  /** Le bouton compact de mon onglet (le seul bouton principal de l'écran). */
  publish: "Publier",
  /** Toucher une vignette de la grille. */
  openPost: "Ouvrir la publication",
  /** Chez moi, sans publication. */
  emptyMineTitle: "Publie ta première photo",
  emptyMineText: "Elle ira sur ton profil, et ton Fil la montrera à tes abonnés.",
  /** Chez un autre, sans publication (le profil ne s'ouvre pas dessus, mais l'onglet reste touchable). */
  emptyOtherTitle: "Pas encore de publication",
  emptyOtherText: (pseudo: string) => `${pseudo} n'a rien publié pour l'instant.`,
  /** Compte privé, liste restreinte : le même panneau qu'il ait publié ou non. */
  privateTitle: "Compte privé",
  privateText: (pseudo: string) => `Les publications de ${pseudo} ne sont visibles que de ses abonnés acceptés.`,
  privateAsk: "Demander à suivre",
  privateAsked: (pseudo: string) => `Demande envoyée à ${pseudo}`,
  /** Chargement, panne, suite par curseur. */
  loading: "Chargement des publications…",
  error: "Les publications ne se chargent pas pour le moment.",
  retry: "Réessayer",
  more: "Voir plus",
  /** La légende d'une carte repliée après trois lignes. */
  captionMore: "plus",
  captionLess: "moins",
  /** La petite ligne d'une carte posée dans une liste de profil (à la place de la raison du Fil), avant « il y a 3 h ». */
  cardReasonMine: "Sur ton profil",
  cardReasonOther: "Sur son profil",
  /** Lot R8g : la même petite ligne quand l'auteur est une page (structure, fiche pro). */
  cardReasonMinePage: "Sur ta page",
  cardReasonOtherPage: "Sur sa page",
  /** Date et lieu sous une vignette (le lieu est facultatif). */
  tileLabel: (date: string, place: string | null) => (place ? `${date}, ${place}` : date),
  // La publication seule (`/publication/<id>`, `/app/publication/:id`).
  pageTitle: "Publication",
  back: "Retour",
  gone: "Cette publication n'est plus visible.",
  goneBack: "Retour au Fil",
  menuOpen: "Plus d'actions",
  menuRemove: "Supprimer",
  menuCommentsOff: "Couper les commentaires",
  menuCommentsOn: "Rétablir les commentaires",
  /** La copie gardée de mon onglet, sans réseau : la phrase de l'Accueil hors ligne (lot R8c2) vient de `lib/offlineCopy`. */
  offlineList: "Hors ligne : voici ce que ton téléphone a gardé.",
} as const;
