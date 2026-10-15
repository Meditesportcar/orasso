import type {
  DevicePlatform,
  EventAdmission,
  EventFormat,
  EventOutlook,
  EventPublicAccess,
  EventStatus,
  ProfileVisibility,
  RefusalReason,
  StructureKind,
  StructureVerification,
  VehicleStatus,
  VehicleType,
} from "./enums";

/**
 * Libellés d'interface en français, exactement ceux des docs et du prototype validé.
 * Aucun libellé n'est écrit ailleurs (écrans, e-mails, notifications passent par ici).
 * Statuts de candidature, grades et rôles : `application.ts`, `grades.ts`, `roles.ts`.
 */

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

export const vehicleTypeLabels: Record<VehicleType, string> = {
  car: "Voiture",
  moto: "Moto",
  truck: "Camion",
};

export const vehicleStatusLabels: Record<VehicleStatus, string> = {
  active: "Actif",
  sold: "Vendu",
  keepsake: "Gardé par passion",
  wrecked: "Accidenté",
};

export const structureKindLabels: Record<StructureKind, string> = {
  association: "Association",
  club: "Club",
  circuit: "Circuit",
  company: "Entreprise",
  collectivity: "Collectivité",
};

export const structureVerificationLabels: Record<StructureVerification, string> = {
  unverified: "Non vérifiée",
  pending: "Vérification en cours",
  verified: "Structure vérifiée",
  suspended: "Suspendue",
};

export const profileVisibilityLabels: Record<ProfileVisibility, string> = {
  public: "Public",
  private: "Privé",
};

export const devicePlatformLabels: Record<DevicePlatform, string> = {
  ios: "iPhone",
  android: "Android",
  web: "Navigateur",
};

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

/** Libellé de la ligne « Autre » du référentiel (marque, modèle, génération). */
export const OTHER_LABEL = "Autre";
