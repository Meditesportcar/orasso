import type {
  DayAccess,
  EventAdmission,
  EventFormat,
  EventOutlook,
  EventPublicAccess,
  EventStatus,
  RefusalReason,
} from "../enums";
import { vendorTypeChoices, vendorTypeLabels } from "../provider";

// Événements : formats, admission, accès du public, statuts, prestataires, règlement, motifs de refus.

export const eventFormatLabels: Record<EventFormat, string> = {
  gathering: "Rassemblement",
  exhibition: "Exposition",
  cars_and_coffee: "Cars & coffee",
  show: "Salon",
  open_house: "Portes ouvertes",
  night: "Nocturne",
};

export const eventAdmissionLabels: Record<EventAdmission, string> = {
  open: "Sans sélection",
  filtered: "Sur filtration",
  invite_only: "Sur invitation",
};

/** Événements sur plusieurs jours (lot 26) : mode d'accès choisi par l'organisateur dans l'assistant. */
export const dayAccessLabels: Record<DayAccess, string> = {
  whole: "Tout l'événement",
  per_day: "Par jour",
  both: "Au choix : tout l'événement ou un jour",
};

/** Libellés des jours (assistant, page événement, candidature, Accès, tri, jour J, mode staff). */
export const eventDaysLabels = {
  multiDay: "Plusieurs jours",
  days: "Jours",
  day: "Jour",
  addDay: "Ajouter un jour",
  removeDay: "Retirer ce jour",
  dayCapacity: "Places ce jour (facultatif)",
  dayCapacityHint: "Comme l'événement",
  dayAccess: "Accès des participants",
  wholeEvent: "Tout l'événement",
  chooseDay: "Pour quel jour ?",
  allDays: "Tous les jours",
  today: "Aujourd'hui",
  dayFull: "Complet ce jour",
  alreadyApplied: "Déjà candidat",
  otherDay: "Inscrit pour un autre jour",
  otherDayHint: "Ce QR est valable un autre jour. Vérifie avec le conducteur avant d'accepter.",
  dayInUse: "Ce jour a des candidatures : il ne peut plus être retiré",
} as const;

export const eventPublicAccessLabels: Record<EventPublicAccess, string> = {
  free: "Entrée libre",
  free_reservation: "Gratuite sur réservation",
  paid_orasso: "Payante · billetterie Orasso",
  paid_external: "Payante · billetterie externe",
  closed: "Fermé au public",
};

export const eventStatusLabels: Record<EventStatus, string> = {
  draft: "Brouillon",
  published: "Publié",
  cancelled: "Annulé",
};

export const eventOutlookLabels: Record<EventOutlook, string> = {
  maintained: "Maintenu",
  uncertain: "Incertain",
};

/** « Paiement sur place » (lot 21) : entrée payante sans billetterie en ligne (`paid_external` sans adresse). */
export const ON_SITE_PAYMENT_LABEL = "Entrée payante · paiement sur place";

/** Entrée du public telle qu'elle s'affiche : le libellé du mode, ou « paiement sur place » sans lien de billetterie. */
export function publicAccessText(access: EventPublicAccess, externalTicketUrl: string | null | undefined): string {
  return access === "paid_external" && !externalTicketUrl ? ON_SITE_PAYMENT_LABEL : eventPublicAccessLabels[access];
}

/** Types de prestataires proposés à la création d'un événement (cases à cocher ; « + » pour en ajouter un autre). */
export const vendorTypeSuggestions: readonly string[] = vendorTypeChoices.map((c) => vendorTypeLabels[c]);

/**
 * Modèle de règlement proposé par Orasso (docs/01 : « un modèle général proposé par Orasso, et une option de texte
 * libre »). Texte provisoire, à faire relire par un juriste avant l'ouverture.
 */
export const defaultEventRules = [
  "Règlement de l'événement",
  "",
  "1. Je respecte le code de la route et les consignes de l'équipe d'accueil, sur le site comme à l'entrée et à la sortie.",
  "2. Pas de burn, de départ en trombe ni de bruit excessif : l'équipe organisatrice peut refuser l'entrée ou exclure un véhicule.",
  "3. Mon véhicule est assuré et conforme à la réglementation ; je suis responsable de lui et de mes passagers.",
  "4. Je me gare à la place indiquée par l'équipe et je ne la quitte pas sans prévenir.",
  "5. Je respecte les lieux, les riverains et les autres participants : je ne laisse aucun déchet.",
  "6. Si je ne peux plus venir, je me désiste avant le verrouillage des inscriptions pour libérer ma place.",
].join("\n");

/** Feuille « Motif du refus » du prototype, plus les deux alertes du tri. */
export const refusalReasonLabels: Record<RefusalReason, string> = {
  off_theme: "Hors thème",
  insufficient_photos: "Photos insuffisantes",
  full: "Complet",
  vehicle_already_retained: "Véhicule déjà retenu",
  unregistered_vehicle: "Véhicule non immatriculé",
  criteria_not_met: "Ne correspond pas aux critères",
  other: "Autre",
};
