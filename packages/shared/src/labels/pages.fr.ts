// La page d'une structure et la fiche d'un pro, vues par un visiteur (vague R8, lot R8g, maquettes R8.6 `pu-publi` et R9.3
// `n-page`, vue « Un visiteur ») : l'en-tête compact, les onglets, le filtre des publications, « Mentions ». Appli et site disent
// les mêmes mots, copiés des maquettes au caractère près ; les phrases que la maquette ne montre pas sont notées dans le journal
// des choix (section « Lot R8g »).
import { pluralFr } from "./plural.fr";

export const pagesLabels = {
  /** Nom accessible de la rangée d'onglets. */
  group: "Contenu de la page",
  /** Les onglets (R9.3 : « Événements · Publications · Mentions » ; R8.6 pour le pro : « Présentation · Publications · Mentions »). */
  tabEvents: "Événements",
  tabPresentation: "Présentation",
  tabPublications: "Publications",
  tabMentions: "Mentions",
  /** Le filtre des publications d'une structure (R8.6 `pageH`). */
  filterGroup: "Filtrer les publications",
  filterAll: "Tout",
  filterEvent: "Événements",
  filterNoEvent: "Hors événement",
  /** Le type de la page, sur la ligne de la vérification (R9.3 : `tagX(c.type)`, puis la coche et « Vérifié »). */
  typeStructure: "Organisateur",
  typePro: "Pro",
  verifiedStructure: "Vérifié",
  verifiedPro: "Pro vérifié",
  /** Le logo dans son anneau de stories. */
  openStories: "Voir ses stories",
  /** Les compteurs de la bande (le libellé accordé au nombre). */
  followers: (n: number) => pluralFr(n, "abonné", "abonnés"),
  events: (n: number) => pluralFr(n, "événement", "événements"),
  partners: (n: number) => pluralFr(n, "partenaire", "partenaires"),
  organizers: (n: number) => pluralFr(n, "organisateur", "organisateurs"),
  countsGroup: "Chiffres de la page",
  /** Les icônes empilées à droite du logo. */
  message: "Message",
  more: "Plus",
  moreTitle: "Plus d'actions",
  route: "Itinéraire",
  call: "Appeler",
  share: "Partager",
  reportStructure: "Signaler cette structure",
  reportPro: "Signaler ce pro",
  /** La bio sur une ligne. */
  bioMore: "plus",
  bioLess: "moins",
  /** « Suivre » (le seul bouton principal de l'écran) et son état. */
  follow: "Suivre",
  following: "Suivi",
  /** Onglet « Événements ». */
  eventsNext: "Événements à venir",
  eventsPast: "Événements passés",
  eventsNone: "Aucun événement à venir.",
  eventsAbout: "À propos",
  eventsPartners: "Pros partenaires",
  eventsInvite: "Lien d'invitation",
  eventsInviteText: (name: string) =>
    `Partage ce lien à tes passionnés : en créant leur compte, ils suivent ${name} et sont prévenus de tes prochains événements en avant-première.`,
  /** Onglet « Publications » : les états vides selon le filtre. */
  emptyTitle: "Pas encore de publication",
  emptyText: (name: string) => `${name} n'a rien publié pour l'instant.`,
  emptyEvent: "Aucune publication rattachée à un événement pour l'instant.",
  emptyNoEvent: "Aucune publication en dehors des événements pour l'instant.",
  /** Onglet « Mentions ». */
  mentionsEmpty: "Personne n'a encore cité cette page.",
  mentionsLoading: "Chargement des mentions…",
  mentionsError: "Les mentions ne se chargent pas pour le moment.",
  mentionsMore: "Voir plus",
  mentionsRetry: "Réessayer",
  mentionOpen: "Ouvrir la publication",
  mentionAuthor: (name: string) => `Voir la page de ${name}`,
  commercialTag: "Collaboration commerciale",
  /** « a cité Atelier Têt Detailing » quand la mention n'a ni rattachement ni collaboration. */
  mentionCited: (name: string) => `a cité ${name}`,
  /** Les responsables de la page. */
  hide: "Masquer de la page",
  unhide: "Remettre sur la page",
  hiddenTag: "Masquée",
  hideError: "L'opération n'a pas abouti. Réessaie dans un instant.",
  /** Page non trouvée. */
  structureMissing: "Cette structure n'existe pas ou plus.",
  proMissing: "Cette fiche n'existe pas ou plus.",
} as const;
