import type { MediaContentView, MediaPlatform } from "../schemas/media";
import { pluralFr } from "./plural.fr";

// Casquette Média de l'appli (lot 55, prototype DA v2 `s-agenda`, `s-accred`, `s-contenus`) : textes des écrans
// Explorer, Presse, Contenus, de la création du profil média et des blocs de la fiche événement. Les libellés de l'API
// (états d'accréditation, temps de route) restent dans `media.fr.ts` (`mediaLabels`). Pas de numéro de carte de presse (D26).

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("fr-FR")} ${pluralFr(n, one, many)}`;

export const mediaAppLabels = {
  // --- Explorer ---------------------------------------------------------------------------------------------------------
  explorerTitle: "Explorer",
  explorerFacts: "Toute la France",
  segSearch: "Chercher",
  segAgenda: "Mon agenda",
  searchPlaceholder: "Événement, ville, département, organisateur",
  searchLabel: "Rechercher un événement",
  where: "Où",
  allFrance: "Toute la France",
  whatWhen: "Quoi et quand",
  thisMonth: "Ce mois-ci",
  openOnly: "Accréditation ouverte",
  results: (n: number, more: boolean, openOnly: boolean) =>
    `${n}${more ? "+" : ""} événement${n > 1 || more ? "s" : ""}${openOnly ? " avec accréditation ouverte" : ""}, par date`,
  map: "Carte",
  list: "Liste",
  mapHint: "Touche une étiquette pour voir l'événement.",
  loading: "On cherche partout en France…",
  emptyTitle: "Rien par ici",
  emptyText: "Aucun événement ne correspond. Élargis la zone ou retire « Accréditation ouverte ».",
  request: "Demander",
  keep: "Garder",
  kept: "Gardé",
  keepA11y: (title: string) => `Garder ${title} dans mon agenda`,
  keptA11y: (title: string) => `${title} est gardé : le retirer de mon agenda`,
  invitation: "Invitation",
  closed: "Fermée",
  agendaIntro: "Les événements que tu couvres ou que tu as gardés, semaine par semaine.",
  thisWeek: "Cette semaine",
  later: "Plus tard",
  agendaEmpty: "Rien dans ton agenda",
  agendaEmptyText:
    "Garde un événement avec le cœur ou demande une accréditation : il apparaît ici, semaine par semaine.",
  keptOpen: "gardé, accréditation ouverte",
  keptOnly: "gardé",
  pressOnInvitation: "presse sur invitation",
  weekDays: ["L", "M", "M", "J", "V", "S", "D"],
  weekDayA11y: (label: string, covered: boolean) => `${label}${covered ? " : un événement" : ""}`,

  // --- Demande d'accréditation (feuille) ------------------------------------------------------------------------------------
  requestTitle: "Demander une accréditation",
  requestFor: (title: string) => `Pour « ${title} »`,
  requestFormats: "Ce que tu produis",
  requestMessage: "Un mot pour l'organisation",
  requestMessageHelp: "Facultatif : ton média, ce que tu comptes montrer.",
  requestRules: "Règlement de l'événement",
  requestRulesNote: "En envoyant ta demande, tu acceptes le règlement de l'événement.",
  requestNoRules: "L'organisation n'a pas écrit de règlement particulier.",
  requestSend: "Envoyer la demande",
  requestSent: "Demande envoyée",
  requestSentText: "L'organisation te répond dans Presse. Tu es prévenu dès qu'elle décide.",
  requestProfileFirst: "Crée d'abord ton profil média",

  // --- Presse -------------------------------------------------------------------------------------------------------------
  pressTitle: "Accréditations",
  upcoming: (n: number) => `À venir · ${n}`,
  past: (n: number) => `Passées · ${n}`,
  pressEmpty: "Aucune accréditation à venir",
  pressEmptyText: "Cherche un événement avec « Accréditation ouverte » dans Explorer, puis demande ton accréditation.",
  pressPastEmpty: "Aucune accréditation passée",
  pressPastEmptyText: "Les événements que tu as couverts se rangent ici, avec ce que tu as publié et les vues.",
  pressSeeExplorer: "Chercher un événement",
  badgeOf: "Badge presse",
  badgeZones: (zones: string) => `Badge presse · ${zones}`,
  formatsLine: (formats: string) => formats,
  requestedOn: (date: string, formats: string) => `Demande envoyée le ${date} · ${formats}`,
  covered: (n: number) => `Couvert · ${plural(n, "contenu")}`,
  coveredViews: (views: number) => `${plural(views, "vue")} depuis la page de l'événement`,
  notCovered: "Rien publié sur cet événement",
  addContentFor: "Ajouter un contenu",
  withdraw: "Retirer ma demande",
  withdrawConfirm: "Retirer ma demande ?",
  withdrawText: "L'organisation ne la verra plus. Tu pourras en refaire une tant que l'accréditation est ouverte.",
  withdrawYes: "Oui, retirer",
  withdrawNo: "Non, la garder",
  withdrawn: "Demande retirée",
  briefingTitle: "Consignes",
  briefingZones: "Zones",
  briefingInstructions: "Consignes",
  briefingContact: "Contact",
  briefingNone:
    "L'organisation n'a pas encore donné de consignes. Elles s'afficheront ici dès qu'elles seront écrites.",
  badgeNotYet: "Ton badge presse arrive : il est émis dès que l'accréditation est confirmée.",
  daysLeft: (n: number) => (n <= 0 ? "Aujourd'hui" : `J-${n}`),
  refusedDefault: "L'organisation n'a pas retenu ta demande.",
  cancelledEvent: "Événement annulé",

  // --- Contenus -------------------------------------------------------------------------------------------------------------
  contentsTitle: "Contenus",
  views: "Vues depuis Orasso",
  contents: "Contenus",
  addContent: "Ajouter un contenu",
  featured: "Mis en avant sur la page",
  noContents: "Aucun contenu pour l'instant",
  noContentsText:
    "Dès que ton accréditation est acceptée, ajoute un lien (article, vidéo) ou une galerie : ils s'affichent sur la page de l'événement.",
  needAccreditation:
    "Tu peux publier sur un événement où ton accréditation est acceptée. Demande d'abord ton accréditation dans Explorer.",
  addTitle: "Ajouter un contenu",
  addEvent: "Événement",
  addKind: "Ce que tu ajoutes",
  addTitleField: "Titre",
  addTitleHelp: "80 caractères au plus.",
  addUrl: "Adresse du lien",
  addUrlHelp: "https:// obligatoire : article, vidéo YouTube, publication Instagram.",
  addPlatform: "Où c'est publié",
  addPhotos: "Photos",
  addPhotosCount: (n: number, max: number) => `${n} sur ${max}`,
  addPhotosPick: "Choisir des photos",
  addPhotosRemove: "Retirer cette photo",
  addPublish: "Publier",
  editTitle: "Modifier le contenu",
  editSave: "Enregistrer",
  deleteContent: "Supprimer ce contenu",
  deleteConfirm: "Supprimer ce contenu ?",
  deleteText: "Il disparaît de la page de l'événement. Les vues déjà comptées restent dans ta couverture.",
  deleteYes: "Oui, supprimer",
  deleteNo: "Non, le garder",
  /** Étiquette d'une ligne : « Article · la nuit des japonaises ». */
  kindOf: (c: Pick<MediaContentView, "kind" | "platform">) => {
    if (c.kind === "gallery") return "Galerie";
    const byPlatform: Record<MediaPlatform, string> = {
      youtube: "Vidéo",
      website: "Article",
      instagram: "Publication",
      other: "Lien",
    };
    return byPlatform[c.platform];
  },
  galleryStats: (photos: number) => plural(photos, "photo"),
  viewsCount: (n: number) => plural(n, "vue"),
  openContent: "Ouvrir",
  uploadFailed: "Une photo n'a pas pu être envoyée. Réessaie.",
  // Floutage des plaques à l'envoi d'une photo de galerie (D28, Damien le 21/10/2026) : proposé, jamais imposé.
  addPhotosBlurTitle: "Flouter les plaques ?",
  addPhotosBlurHint:
    "Pose un cadre sur chaque plaque visible : Orasso la floute avant l'envoi, définitivement. Si tes photos sont déjà floutées, envoie-les telles quelles.",
  addPhotosBlurSend: "Flouter et ajouter",
  addPhotosPlainSend: "Envoyer sans flouter",
  addPhotosBlurred: "Plaque floutée",
  /** Relecture du lot 57 : publication bloquée tant qu'une photo est choisie ou en cours d'envoi. */
  addPhotosSending: "Envoi de la photo en cours…",
  addPhotosPending: "Ajoute ou retire la photo choisie avant de publier.",
  /** Relecture du lot 57 : Explorer (panne de l'API distincte d'une recherche vide, pagination). */
  exploreErrorTitle: "Les événements ne se chargent pas",
  exploreErrorText: "Le service ne répond pas pour l'instant. Tes filtres sont gardés.",
  exploreRetry: "Réessayer",
  exploreMore: "Voir la suite",
  /** Relecture du lot 57 (tour 2) : fiche média, contenus publiés (erreur de chargement, galerie complète). */
  contentsErrorTitle: "Les contenus ne se chargent pas",
  contentsErrorText: "Le service ne répond pas pour l'instant. Ce qui est déjà affiché est gardé.",
  contentsRetry: "Réessayer",
  galleryOpenPhoto: (n: number, total: number) => `Ouvrir la photo ${n} sur ${total}`,
  galleryViewer: "Photos de la galerie",
  galleryPrev: "Photo précédente",
  galleryNext: "Photo suivante",
  galleryClose: "Fermer",
  galleryPosition: (n: number, total: number) => `${n} / ${total}`,

  // --- Profil média -----------------------------------------------------------------------------------------------------------
  profileTitle: "Profil média",
  profileCreateIntro:
    "Un nom, ce que tu produis et un lien vers ton travail : l'organisation décide de ton accréditation avec ça.",
  profileName: "Nom du média",
  profileFormats: "Ce que tu produis",
  profileDescription: "Présentation",
  profileWebsite: "Site",
  profileInstagram: "Instagram",
  profileYoutube: "YouTube",
  profileLinkHelp: "Un lien au moins (site, Instagram ou YouTube) pour demander une accréditation.",
  profileLogo: "Logo",
  profileLogoPick: "Choisir un logo",
  profileLogoChange: "Changer le logo",
  profileLogoRemove: "Retirer le logo",
  profileCover: "Où tu couvres",
  profileCoverHelp: "Une zone vide veut dire toute la France. Elle sert à estimer le temps de route.",
  profileCoverAll: "Toute la France",
  profileCoverSome: "Des départements",
  profileCoverCount: (n: number) => plural(n, "département"),
  profileVerifyNote:
    "Orasso vérifie ton profil : une pastille « Profil vérifié » s'affiche ensuite pour les organisations. Aucun numéro de carte de presse n'est demandé.",
  profileReverifyNote:
    "Changer le nom, le site, Instagram, YouTube ou le logo relance la vérification : « Profil vérifié » disparaît jusqu'à la prochaine vérification.",
  profileCreate: "Créer mon profil média",
  profileSave: "Enregistrer",
  profileSaved: "Profil enregistré",
  profileVerified: "Profil vérifié",
  profileToVerify: "Profil à vérifier",
  /** Ligne de la casquette dans Mon profil. */
  casquetteEdit: "Mon profil média",
  casquetteEditCaption: (verified: boolean | null) =>
    verified === null ? "Nom, formats, liens, zone couverte" : verified ? "Profil vérifié" : "Profil à vérifier",
  casquettePress: "Mes accréditations",
  casquettePressCaption: "Badge presse et consignes",
  createTitle: "Un profil média",
  createCaption: "Journaliste, photographe, vidéaste : demander des accréditations",

  // --- Fiche événement --------------------------------------------------------------------------------------------------------
  eventRequest: "Demander une accréditation",
  eventMine: "Mon accréditation",
  eventClosedTitle: "Accréditation presse fermée",
  eventClosedText: "L'organisation n'a pas ouvert l'accréditation presse pour cet événement.",
  eventContents: "Contenus",
  eventContentsCaption: "Publiés par les médias accrédités",
  eventGalleryOpen: (n: number) => `Voir les ${plural(n, "photo")}`,
  eventGalleryClose: "Fermer la galerie",
  eventFeatured: "Mis en avant",
  by: (name: string) => `par ${name}`,
} as const;
