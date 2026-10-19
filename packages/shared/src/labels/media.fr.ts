import type { MediaContentKind, MediaFormat, MediaPlatform } from "../schemas/media";

// Média et accréditation presse (lot 45) : textes du prototype DA v2 (`s-agenda`, `s-accred`, `s-contenus`) et
// messages de l'API. Les écrans (lots 55 et 57) lisent ici.

export const mediaFormatLabels: Record<MediaFormat, string> = {
  photo: "Photo",
  video: "Vidéo",
  article: "Article",
  live: "Direct",
};

export const mediaContentKindLabels: Record<MediaContentKind, string> = {
  link: "Lien",
  gallery: "Galerie",
};

export const mediaPlatformLabels: Record<MediaPlatform, string> = {
  youtube: "YouTube",
  instagram: "Instagram",
  website: "Site",
  other: "Autre",
};

export const mediaLabels = {
  /** Résultat de scan et liste du staff : « Presse · Sud Cars ». */
  scanKind: "Presse",
  pressLabel: (mediaName: string) => `Presse · ${mediaName}`,
  // États d'accréditation (`s-agenda`, `s-accred`).
  accredited: "Accréditée",
  pending: "En attente",
  refused: "Refusée",
  request: "Demander",
  accreditationOpen: "Accréditation ouverte",
  saved: "Gardé",
  myAgenda: "Mon agenda",
  pressBadge: "Mon badge presse",
  instructions: "Consignes",
  featuredOnPage: "Mis en avant sur la page",
  viewsFromOrasso: "Vues depuis Orasso",
  addContent: "Ajouter un contenu",
  travelTime: (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (!h) return `${m} min de route`;
    return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h de route`;
  },
  coverage: (contents: number, views: number) =>
    `Couvert · ${contents} contenu${contents > 1 ? "s" : ""} · ${views.toLocaleString("fr-FR")} vues depuis la page de l'événement`,
  requestSent: (date: string) => `Demande envoyée le ${date}`,
  // Erreurs de l'API.
  profileMissing: "Crée d'abord ton profil média",
  profileExists: "Tu as déjà un profil média",
  accreditationClosed: "L'accréditation presse n'est pas ouverte pour cet événement",
  quotaReached: "Quota presse atteint",
  deadlinePassed: "La date limite des demandes d'accréditation est passée",
  alreadyRequested: "Tu as déjà une accréditation en cours pour cet événement",
  notAccredited: "Tu dois être accrédité sur cet événement pour y publier un contenu",
  noWaitlist: "Une accréditation se retient ou se refuse : pas de liste d'attente pour la presse",
  eventEnded: "L'événement est terminé",
  eventCancelled: "Événement annulé",
  requestsLocked: "Les demandes d'accréditation sont closes (deux heures avant l'événement)",
  imageUnknown: "Image inconnue ou déjà utilisée",
  contentNotFound: "Contenu introuvable",
  // Notifications.
  requestedTitle: "Demande d'accréditation presse",
  requestedBody: (mediaName: string, eventTitle: string) =>
    `${mediaName} demande une accréditation presse pour « ${eventTitle} ».`,
  acceptedTitle: "Accréditation presse acceptée",
  acceptedBody: (eventTitle: string, date: string) =>
    `Tu es accrédité pour « ${eventTitle} », ${date}. Ton badge presse et les consignes sont dans Presse.`,
  refusedTitle: "Accréditation presse refusée",
  refusedBody: (eventTitle: string) => `Ton accréditation presse pour « ${eventTitle} » n'est pas retenue.`,
  featuredTitle: "Contenu mis en avant",
  featuredBody: (title: string, eventTitle: string) =>
    `« ${title} » est mis en avant sur la page de « ${eventTitle} ».`,
  linkPress: { label: "Ouvrir mes accréditations", path: "/app/media" },
  linkTriage: (structureSlug: string, eventId: string) => ({
    label: "Voir les demandes",
    path: `/orga/${structureSlug}/e/${eventId}/presse`,
  }),
} as const;
