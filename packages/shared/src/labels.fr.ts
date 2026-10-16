import type {
  CheckinMethod,
  DevicePlatform,
  EventAdmission,
  EventFormat,
  EventOutlook,
  EventPublicAccess,
  EventStatus,
  ProfileVisibility,
  RefusalReason,
  StaffPresence,
  StructureKind,
  StructureVerification,
  VehicleStatus,
  VehicleType,
  VerificationDocumentKind,
} from "./enums";
import type { LocalScanDecision, ScanRefusal } from "./qr/pass";
import type { ContestStatus, PointKind } from "./rules/points";

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

export const verificationDocumentKindLabels: Record<VerificationDocumentKind, string> = {
  statutes: "Statuts",
  receipt: "Récépissé de déclaration",
  kbis: "Extrait Kbis",
  identity: "Pièce d'identité du responsable",
  other: "Autre justificatif",
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

// --- Accès, jour J, points (lot 06) ------------------------------------------------------------------------------

/** Raison d'un scan refusé par l'appli du staff (ARCHITECTURE.md § 3.1, prototype « Refusé »). */
export const scanRefusalLabels: Record<ScanRefusal, string> = {
  unknown_qr: "QR inconnu",
  unknown_key: "Clé inconnue : synchronise",
  forged: "QR falsifié",
  other_event: "QR d'un autre événement",
  withdrawn: "Désisté",
  refused: "Non admis",
  cancelled: "Annulé",
  banned: "Non admis",
  replaced: "QR remplacé",
};

/** Résultat d'une lecture côté appli (écran ScanResult : « OK », « Déjà entré », « Refusé »). */
export const localScanDecisionLabels: Record<LocalScanDecision, string> = {
  ok: "OK",
  already: "Déjà entré",
  refused: "Refusé",
  override: "Accepté quand même",
  unknown_pass: "QR valide mais absent de ta liste : synchronise",
};

export const checkinMethodLabels: Record<CheckinMethod, string> = {
  scan: "Scan",
  manual: "Sans scan",
  plate: "Pointage par plaque",
  express: "Inscription express",
};

export const staffPresenceLabels: Record<StaffPresence, string> = {
  unknown: "Pas de réponse",
  present: "Je suis là",
  absent: "Pas là",
};

/** Lignes du barème (prototype « Points et grade ») et des autres écritures. */
export const pointKindLabels: Record<PointKind, string> = {
  participation: "Présent à un événement",
  staff: "Staff sur un événement",
  referral: "Ami invité",
  malus: "Absent sans désistement",
  malus_reversal: "Malus annulé",
  season_carryover: "Report de la saison précédente",
  admin_adjustment: "Ajustement par l'équipe Orasso",
};

export const contestStatusLabels: Record<ContestStatus, string> = {
  pending: "Contesté",
  accepted: "Contestation acceptée",
  rejected: "Contestation refusée",
  escalated: "Transmise à l'administration",
};

/** « Pointage en attente » (docs/01 « après l'événement »). */
export const POINTS_PENDING_LABEL = "Pointage en attente";
