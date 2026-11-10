// Partager un contenu d'Orasso (lot R7f4, maquette R7.23 et R7.24) : libellés de la feuille « Partager », des cartes
// rendues par l'API, de la signature des fichiers sortants et des refus. Mêmes mots dans l'API, l'appli et le site.
import type { StoryLinkType } from "../schemas/stories";

export const shareLabels = {
  title: "Partager",
  sectionTitle: "Partager",
  close: "Fermer",
  /** Les quatre destinations de la feuille. */
  story: "En story",
  feed: "Dans le Fil",
  message: "En message",
  external: "Vers l'extérieur",
  storyHint: (link: string) => `Une carte sur un fond 9:16, touchable : « ${link} »`,
  feedHint: "Une publication en 4:5",
  messageHint: "À un pote ou à ton crew",
  externalHint: "Instagram, WhatsApp, TikTok… par le partage du téléphone",
  /** Titre de la feuille, selon le contenu. */
  yours: "Ta voiture",
  subtitleVehicle: "Ta voiture · Garage",
  /** Raisons d'une destination fermée (l'API les donne, l'écran les affiche sous la ligne grisée). */
  reasons: {
    vehicleNoPhoto: "Ajoute une photo à plaque floutée pour partager cette voiture.",
    notAvailable: "Ce contenu n'est pas disponible au partage.",
    feedLimited: "Dans le Fil, seuls un événement et une voiture se partagent pour le moment.",
    externalAuthorOnly: "Seul l'auteur peut envoyer cette publication hors d'Orasso.",
    memoryPrivate: "Un souvenir est personnel : il ne se partage pas dans le Fil.",
    voteOpen: "Le résultat se partage une fois le vote clos.",
    noRanking: "Le classement n'est pas encore visible pour toi.",
    crewOnly: "Une story de crew ne sort jamais du crew.",
    privateFeed: "Le compte de l'auteur est privé : sa publication ne se repartage pas.",
  },
  /** Touchable dans la visionneuse. */
  link: {
    event: "Voir l'événement",
    vehicle: "Voir la voiture",
    feed_post: "Voir dans le Fil",
    memory: "Voir le souvenir",
    vote_result: "Voir le classement",
  } satisfies Record<StoryLinkType, string>,
  /** Étiquette de la carte, en haut du texte (rendue par l'API). */
  kicker: { vehicle: "Voiture", feed_post: "Publication", memory: "Souvenir", vote_result: "Vote" },
  memoryYears: (n: number) => (n <= 1 ? "Il y a un an" : `Il y a ${n} ans`),
  badgeLive: "En cours",
  badgeFirst: (votes: number) => `1re · ${votes} voix`,
  /** Composer en story (aperçu). */
  composeTitle: "Partager en story",
  composeHint: "Déplace · pince pour agrandir",
  publish: "Publier pour 24 h",
  publishing: "Publication…",
  caption: "Légende",
  captionPlaceholder: "Ajoute un mot (facultatif)",
  audience: { public: "Public", followers: "Mes abonnés" },
  /** Organisateur prévenu ou non (événement partagé en story). */
  organizerNotified: "L'organisateur sera prévenu de ta story.",
  organizerNotNotified: "L'organisateur ne sera pas prévenu : compte privé.",
  /** Dans le Fil. */
  feedPublishing: "Publication au Fil…",
  feedDone: "Publié dans le Fil.",
  storyDone: "Story publiée pour 24 h.",
  /** En message. */
  messageTitle: "Envoyer à…",
  messageEmpty: "Aucune conversation : écris d'abord à quelqu'un depuis la Boîte.",
  messageMore: "Voir plus de conversations",
  messageSent: "Message envoyé.",
  messageBody: (title: string, url: string) => `${title} : ${url}`,
  /** Vers l'extérieur. */
  externalTitle: "Partager avec",
  externalSub: "le partage du téléphone",
  externalStory: "Une story",
  externalPost: "Une publication du Fil",
  externalStoryFile: "Fichier 9:16 · 1080 × 1920",
  externalPostFile: "Fichier 4:5 · 1080 × 1350",
  externalNote1: "Une story part plaques floutées, avec une petite signature Orasso.",
  externalNote2: "Le fichier garde le format où il a été fait : 9:16 pour une story, 4:5 pour une publication.",
  externalSaved: "Fichier enregistré.",
  externalDownload: "Télécharger le fichier",
  externalFailed: "Impossible de préparer le fichier : vérifie ta connexion.",
  // Menu « ⋯ » de ma story.
  menuExternal: "Vers l'extérieur",
  /** Signature posée sur les fichiers qui sortent d'Orasso. */
  signature: "orasso.fr",
  /** Erreurs de l'API. */
  errors: {
    notFound: "Contenu introuvable.",
    crewOnly: "Une story de crew ne sort jamais du crew.",
    authorOnly: "Seul l'auteur peut exporter ce contenu.",
    noPhoto: "Cette voiture n'a pas de photo montrable : floute la plaque ou confirme qu'aucune n'est visible.",
    voteOpen: "Le résultat se partage une fois le vote clos.",
    privateAuthor: "Cette publication vient d'un compte privé : elle ne se repartage pas.",
    unsupported: "Ce contenu ne se partage pas ainsi.",
  },
} as const;
