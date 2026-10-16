import type {
  EventAdmission,
  EventFormat,
  EventOutlook,
  EventPublicAccess,
  EventStatus,
  RefusalReason,
} from "../enums";

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

/** Types de prestataires proposés à la création d'un événement (cases à cocher ; « + » pour en ajouter un autre). */
export const vendorTypeSuggestions = [
  "Food truck",
  "Barbier",
  "Tatoueur",
  "Photographe",
  "Animation",
  "Vente de pièces",
  "Detailing",
  "Boisson",
] as const;

/**
 * Modèle de règlement proposé par Orasso (docs/01 : « un modèle général proposé par Orasso, et une option de texte
 * libre »). Texte provisoire, à faire relire par un juriste avant l'ouverture.
 */
export const defaultEventRules = [
  "Règlement de l'événement",
  "",
  "1. Je respecte le code de la route et les consignes de l'équipe d'accueil, sur le site comme à l'entrée et à la sortie.",
  "2. Pas de burn, de départ en trombe ni de bruit excessif : l'organisateur peut refuser l'entrée ou exclure un véhicule.",
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
