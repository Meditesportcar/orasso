import type { FeedFilter, FeedReasonCode } from "../rules/feed";

// L'écran du Fil et « Publier au Fil » (lot R7e2, D38, maquette R7.6 `p-fil` et R7.24 `s-ext`) : libellés communs à
// l'appli et au site. Les libellés de l'API (raisons, genres, menu ⋯) restent dans `feed.fr.ts`.

/** Les trois puces de filtre, dans l'ordre de la maquette. */
export const feedScreenFilters: { value: FeedFilter; label: string }[] = [
  { value: "for_you", label: "Pour toi" },
  { value: "nearby", label: "Autour de moi" },
  { value: "following", label: "Abonnements" },
];

/** « Pourquoi je vois ça » : la raison détaillée, en clair (texte fixe pour `sponsored`, posé par le lot R7k2). */
export function feedWhyText(code: FeedReasonCode, who?: string | null, mine = false): string {
  if (mine) return "C'est ta publication : les personnes qui te suivent la voient dans leur Fil.";
  switch (code) {
    case "following_author":
      return who ? `Tu suis ${who} : ce qu'il ou elle publie arrive dans ton Fil.` : "Tu suis cette personne.";
    case "following_structure":
      return "Tu suis cet organisateur : ses annonces et ses événements publics arrivent ici.";
    case "following_pro":
      return "Tu suis ce professionnel : ses nouveautés arrivent ici.";
    case "crew_mate":
      return "Quelqu'un de ton crew est concerné par cette carte.";
    case "your_styles":
      return "Elle correspond à tes types de voitures, ceux de ton garage et de tes préférences.";
    case "near_you":
      return "Elle est près de chez toi, dans ton département ou à côté.";
    case "recommended_event":
      return "Un événement à venir dans ton secteur, ouvert à tous.";
    case "lineup_today":
      return "Un événement a lieu aujourd'hui : voici son plateau. Les plaques des photos sont floutées.";
    case "vote_result":
      return "Le vote est clos : voici son podium.";
    case "pro_near":
      return "Un professionnel de la plateforme, près de chez toi.";
    case "from_orasso":
      return "Orasso publie ces cartes pour bien démarrer, tant que ton Fil se remplit.";
    case "new_here":
      return "C'est nouveau sur Orasso, dans ton secteur.";
  }
}

export const feedScreenLabels = {
  /** Ligne sous « Pourquoi je vois ça » : le Fil ne classe que sur ces critères. */
  whyNote:
    "Le Fil classe les cartes selon ce que tu suis, la distance, tes types de voitures et la fraîcheur. Rien d'autre : pas de vente de données.",
  whyTitle: "Pourquoi je vois ça",
  whyClose: "Compris",
  more: "Plus",
  moreFor: (title: string) => `Plus d'options pour : ${title}`,
  menuWhyHint: "La raison, en clair",
  menuLessHint: "Le Fil en tient compte au prochain rafraîchissement",
  report: "Signaler",
  reportHint: "Un contenu choquant, une plaque lisible, du spam",
  lessKind: (kindLabel: string) => `On t'en montrera moins : ${kindLabel.toLowerCase()}.`,
  lessUndo: "Annuler",
  lessFaded: "Moins de ce genre",
  publish: "Publier",
  publishTitle: "Publier au Fil",
  publishSubtitle: "Pour tes abonnés",
  retry: "Réessayer",
  loadMore: "Voir la suite",
  loadingMore: "Chargement…",
  end: "Tu as tout vu pour l'instant.",
  loadError: "Le Fil n'a pas pu être chargé.",
  moreError: "La suite n'a pas pu être chargée.",
  tooManyRequests: "Trop de demandes : patiente un instant puis réessaie.",
  // États vides, un par filtre. La règle « pas d'annuaire » : le bouton ouvre la recherche (2 lettres au moins).
  empty: {
    for_you: {
      title: "Rien de nouveau pour l'instant",
      text: "Le Fil se remplit avec ce que tu suis. Reviens plus tard ou cherche des passionnés.",
    },
    nearby: {
      title: "Rien près de chez toi pour l'instant",
      text: "Choisis ton coin dans ton profil pour voir ce qui se passe autour de toi.",
    },
    following: {
      title: "Ton Fil se remplit avec ceux que tu suis",
      text: "Suis des passionnés pour remplir cet onglet.",
    },
  } satisfies Record<FeedFilter, { title: string; text: string }>,
  searchPeople: "Chercher un passionné",
  // Cartes.
  fire: "Flamme",
  fireLabel: (n: number, on: boolean) => `${on ? "Retirer ta flamme" : "Mettre une flamme"} (${n})`,
  seeEvent: "Voir la fiche",
  seeLineup: "Le plateau",
  seeVote: "Le vote",
  seePro: "Sa fiche",
  lineupTitle: (name: string) => `Le plateau de ${name} se remplit`,
  lineupCount: (n: number) => (n === 1 ? "1 voiture sur place" : `${n} voitures sur place`),
  vehicleAdded: "a ajouté une voiture à son garage",
  voteResult: (event: string) => `Résultat du vote · ${event}`,
  rank: (n: number) => (n === 1 ? "1re" : `${n}e`),
  votes: (n: number) => (n === 1 ? "1 voix" : `${n} voix`),
  announcementFrom: "Annonce",
  unknownCard: "Cette carte arrive avec une prochaine mise à jour.",
  photoAlt: (pseudo: string, i: number, n: number) =>
    n > 1 ? `Photo ${i} sur ${n} de ${pseudo}` : `Photo de ${pseudo}`,
  photoOf: (i: number, n: number) => `${i} / ${n}`,
  collabBadge: "Collaboration commerciale",
  mine: "Toi",
  removePost: "Supprimer la publication",
  removeConfirm: "Supprimer cette publication ? Elle disparaît du Fil, pour tout le monde.",
  removeConfirmYes: "Oui, supprimer",
  removeDone: "Publication supprimée.",
  // Publier au Fil.
  publishPhotos: "Photos",
  publishPhotosCount: (n: number, max: number) => `${n} sur ${max}`,
  addPhotos: "Ajouter des photos",
  gallery: "Galerie",
  camera: "Appareil photo",
  removePhoto: "Retirer la photo",
  format: "Format",
  formatHint: "Toutes les photos ont le même format. Le 4:5 (portrait) est celui du Fil.",
  formatChanged: "Le format a changé : vérifie la plaque de chaque photo.",
  plateTitle: "Plaque",
  plateIntro:
    "Pour chaque photo : floute la plaque, ou confirme qu'aucune plaque n'est visible. La photo ne part que si la plaque ne se lit pas.",
  plateOk: "Plaque floutée",
  plateNone: "Aucune plaque visible",
  plateTodo: "À régler",
  plateSearching: "Recherche de la plaque…",
  plateFound: (n: number) =>
    n === 1 ? "1 plaque repérée : ajuste le cadre si besoin." : `${n} plaques repérées : ajuste les cadres si besoin.`,
  plateNotFound:
    "Aucune plaque repérée automatiquement : pose un cadre à la main, ou confirme qu'aucune plaque n'est visible.",
  plateConfirmNone: "Aucune plaque n'est visible",
  plateConfirmNoneHint: "Tu le confirmes pour cette photo, comme au Garage.",
  plateUndoNone: "Finalement, je floute une plaque",
  plateFrameFor: (n: number) => `Photo ${n}`,
  caption: "Un mot",
  captionHint: "Facultatif · 500 caractères au plus",
  captionPlaceholder: "Lavée, prête pour dimanche…",
  vehicle: "Quelle voiture ?",
  vehicleNone: "Aucune",
  event: "Quel événement ?",
  eventNone: "Aucun",
  optional: "facultatif",
  sending: (i: number, n: number) => `Envoi de la photo ${i} sur ${n}…`,
  publishing: "Publication…",
  published: "Publié dans le Fil",
  publishedText: "Tes abonnés la voient dans leur Fil. Tu la retrouves dans « Mes publications ».",
  backToFeed: "Retour au Fil",
  // Ce qui bloque « Publier » (une ligne qui dit quoi, jamais un bouton grisé sans raison).
  missingPhoto: "Ajoute au moins une photo.",
  missingPlate: (n: number) => `Photo ${n} : floute la plaque ou confirme qu'aucune plaque n'est visible.`,
  placeFrame: (n: number) => `Photo ${n} : place le cadre sur la plaque.`,
  publishedReason: "Ta publication",
  // Recadrage au doigt (maquette « Glisse pour recadrer »).
  crop: "Recadrer",
  cropHint: "Glisse pour recadrer",
  cropBadge: (aspect: string) => `Cadre fixe · ${aspect}`,
  cropOf: (n: number, total: number, aspect: string) => `Photo ${n} sur ${total} · ${aspect}`,
  captionTooLong: "Un mot de 500 caractères au plus.",
  preparing: "Préparation des photos…",
  mineTitle: "Mes publications",
  mineEmpty: "Tu n'as encore rien publié au Fil",
  mineEmptyText: "Une photo de ta voiture, un mot, et tes abonnés la voient.",
  mineNote: "Une publication supprimée disparaît du Fil et de cette liste, pour tout le monde.",
  mineSettingCaption: "Les photos que tu as publiées au Fil",
} as const;
