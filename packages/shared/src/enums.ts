import { z } from "zod";

import { accountEmailAlwaysTypes, accountNotificationTypes } from "./notifications/account";
import {
  afterEventEmailAlwaysTypes,
  afterEventJournalOnlyTypes,
  afterEventNoEmailTypes,
  afterEventNotificationTypes,
} from "./notifications/after-event";
import { applicationNotificationTypes } from "./notifications/application";
import {
  communicationJournalOnlyTypes,
  communicationNoEmailTypes,
  communicationNotificationTypes,
} from "./notifications/communication";
import { crewNotificationTypes } from "./notifications/crews";
import { eventEmailAlwaysTypes, eventNotificationTypes } from "./notifications/events";
import { garageNotificationTypes } from "./notifications/garage";
import { invitationNotificationTypes } from "./notifications/invitations";
import { messagingNotificationTypes, pushOnlyNotificationTypes as messagingPushOnly } from "./notifications/messaging";
import { moderationEmailAlwaysTypes, moderationNotificationTypes } from "./notifications/moderation";
import { pointsNotificationTypes } from "./notifications/points";
import { journalOnlyNotificationTypes as socialJournalOnly, socialNotificationTypes } from "./notifications/social";
import { staffEmailAlwaysTypes, staffNotificationTypes } from "./notifications/staff";
import { weatherNotificationTypes } from "./notifications/weather";

/** Types sans e-mail de repli (push et Journal seulement), un tableau par domaine. */
export const pushOnlyNotificationTypes: readonly string[] = [
  ...messagingPushOnly,
  ...communicationNoEmailTypes,
  ...afterEventNoEmailTypes,
];
/** Actualités du Journal : ni push ni e-mail, livrées tout de suite (un tableau par domaine). */
export const journalOnlyNotificationTypes: readonly string[] = [
  ...socialJournalOnly,
  ...communicationJournalOnlyTypes,
  ...afterEventJournalOnlyTypes,
];

/**
 * Énumérations métier (valeurs anglaises, identiques aux enums PostgreSQL). Libellés : `labels.fr.ts`.
 * Les statuts de candidature, grades et rôles vivent dans `application.ts`, `grades.ts`, `roles.ts`.
 * Référence : ARCHITECTURE.md § 1.
 */

export const profileVisibilities = ["public", "private"] as const;
export type ProfileVisibility = (typeof profileVisibilities)[number];

export const devicePlatforms = ["ios", "android", "web"] as const;
export type DevicePlatform = (typeof devicePlatforms)[number];

export const structureKinds = ["association", "club", "circuit", "company", "collectivity"] as const;
export type StructureKind = (typeof structureKinds)[number];

export const structureVerifications = ["unverified", "pending", "verified", "suspended"] as const;
export type StructureVerification = (typeof structureVerifications)[number];

/** Pourquoi une structure est suspendue (lot 27) : badge non renouvelé, ou décision de l'équipe. */
export const structureSuspensionReasons = ["badge_expired", "moderation"] as const;
export type StructureSuspensionReason = (typeof structureSuspensionReasons)[number];

/** Justificatifs de la vérification d'une structure (lot 13) ; la pièce d'identité est supprimée à la validation. */
export const verificationDocumentKinds = ["statutes", "receipt", "kbis", "identity", "other"] as const;
export type VerificationDocumentKind = (typeof verificationDocumentKinds)[number];

export const memberStatuses = ["invited", "requested", "active", "removed"] as const;
export type MemberStatus = (typeof memberStatuses)[number];

export const followSources = ["application", "invite_link", "manual"] as const;
export type FollowSource = (typeof followSources)[number];

export const vehicleTypes = ["car", "moto", "truck"] as const;
export const vehicleTypeSchema = z.enum(vehicleTypes);
export type VehicleType = (typeof vehicleTypes)[number];

export const vehicleStatuses = ["active", "sold", "keepsake", "wrecked"] as const;
export type VehicleStatus = (typeof vehicleStatuses)[number];

export const plateTransferStatuses = ["pending", "accepted", "refused", "arbitrated"] as const;
export type PlateTransferStatus = (typeof plateTransferStatuses)[number];

export const eventFormats = ["gathering", "exhibition", "cars_and_coffee", "show", "open_house", "night"] as const;
export type EventFormat = (typeof eventFormats)[number];

export const eventAdmissions = ["open", "filtered", "invite_only"] as const;
export type EventAdmission = (typeof eventAdmissions)[number];

export const eventPublicAccesses = ["free", "free_reservation", "paid_orasso", "paid_external", "closed"] as const;
export type EventPublicAccess = (typeof eventPublicAccesses)[number];

export const eventStatuses = ["draft", "published", "cancelled"] as const;
export type EventStatus = (typeof eventStatuses)[number];

export const eventOutlooks = ["maintained", "uncertain"] as const;
export type EventOutlook = (typeof eventOutlooks)[number];

/** `withdrawn` (lot 25, relecture) : retirée par l'organisateur ; la ligne reste (quotas, garde de 24 h). */
export const invitationStatuses = ["pending", "accepted", "declined", "expired", "withdrawn"] as const;
export type InvitationStatus = (typeof invitationStatuses)[number];

export const applicationKinds = ["vehicle", "provider"] as const;
export type ApplicationKind = (typeof applicationKinds)[number];

export const applicationSources = ["self", "express", "invitation", "crew"] as const;
export type ApplicationSource = (typeof applicationSources)[number];

/** Qui fait passer une candidature d'un statut à l'autre (journal `application_events`). */
export const transitionActors = ["user", "organizer", "staff", "system", "admin"] as const;
export type TransitionActor = (typeof transitionActors)[number];

export const filteringOpinions = ["keep", "doubt", "refuse"] as const;
export type FilteringOpinion = (typeof filteringOpinions)[number];

/** Motifs de refus (ARCHITECTURE.md § 1.5) ; `other` exige une note. */
export const refusalReasons = [
  "off_theme",
  "insufficient_photos",
  "full",
  "vehicle_already_retained",
  "unregistered_vehicle",
  "criteria_not_met",
  "other",
] as const;
export const refusalReasonSchema = z.enum(refusalReasons);
export type RefusalReason = (typeof refusalReasons)[number];

export const triageDecisions = ["accept", "waitlist", "refuse"] as const;
export type TriageDecision = (typeof triageDecisions)[number];

/** `account` (lot 15) : sécurité du compte, jamais coupée, e-mail toujours. */
export const notificationFamilies = ["application", "event", "social", "grade", "staff", "account"] as const;
export type NotificationFamily = (typeof notificationFamilies)[number];

/**
 * Types de notification et leur famille, déclarés par domaine dans `notifications/<domaine>.ts` (lot 15, anti-conflits) :
 * un lot ajoute son fichier et un spread ci-dessous. Une préférence par famille ; `staff` ne se coupe pas.
 */
export const notificationTypes = {
  ...applicationNotificationTypes,
  ...eventNotificationTypes,
  ...staffNotificationTypes,
  ...pointsNotificationTypes,
  ...accountNotificationTypes,
  ...weatherNotificationTypes,
  ...socialNotificationTypes,
  ...garageNotificationTypes,
  ...messagingNotificationTypes,
  ...crewNotificationTypes,
  ...communicationNotificationTypes,
  ...moderationNotificationTypes,
  ...invitationNotificationTypes,
  ...afterEventNotificationTypes,
} as const satisfies Record<string, NotificationFamily>;
export type NotificationType = keyof typeof notificationTypes;

/** Types envoyés par e-mail même quand un appareil reçoit le push (un tableau par domaine). */
export const emailAlwaysTypes: readonly NotificationType[] = [
  ...eventEmailAlwaysTypes,
  ...staffEmailAlwaysTypes,
  ...accountEmailAlwaysTypes,
  ...moderationEmailAlwaysTypes,
  ...afterEventEmailAlwaysTypes,
];

/** Préférences de notification : un interrupteur par famille (docs/01 « Notifications »). */
export const defaultNotificationPrefs = { application: true, event: true, social: true, grade: true };
export type NotificationPrefs = typeof defaultNotificationPrefs;

/** Départements français (métropole, Corse, outre-mer) : codes acceptés pour le secteur d'un profil ou d'une structure. */
export const departments = [
  ...Array.from({ length: 95 }, (_, i) => String(i + 1).padStart(2, "0")).filter((d) => d !== "20"),
  "2A",
  "2B",
  "971",
  "972",
  "973",
  "974",
  "976",
] as const;
export const departmentSchema = z.string().refine((d) => (departments as readonly string[]).includes(d), {
  message: "Département inconnu",
});

// --- Accès et jour J (ARCHITECTURE.md § 1.6, lot 06) ---------------------------------------------------------

/** Présence déclarée par un membre du staff (« Je suis là / pas là »). */
export const staffPresences = ["unknown", "present", "absent"] as const;
export type StaffPresence = (typeof staffPresences)[number];

/** Comment un véhicule est entré (une seule entrée par candidature). */
export const checkinMethods = ["scan", "manual", "plate", "express"] as const;
export type CheckinMethod = (typeof checkinMethods)[number];

/** Décision du serveur sur une lecture reçue d'un appareil (§ 2.5). */
export const scanServerResults = [
  "accepted",
  "duplicate_same_device",
  "duplicate_other_device",
  "rejected",
  "unknown",
] as const;
export type ScanServerResult = (typeof scanServerResults)[number];

/** Fuseau métier unique en V1. */
export const BUSINESS_TIMEZONE = "Europe/Paris";

/** Département d'un code postal français (Corse 2A / 2B, outre-mer sur 3 chiffres) ; `null` si inconnu. */
export function departmentFromPostalCode(postalCode: string | null | undefined): string | null {
  const code = (postalCode ?? "").trim();
  if (!/^\d{5}$/.test(code)) return null;
  if (code.startsWith("97") || code.startsWith("98")) {
    const dom = code.slice(0, 3);
    return (departments as readonly string[]).includes(dom) ? dom : null;
  }
  if (code.startsWith("20")) return Number(code) < 20200 ? "2A" : "2B";
  const dep = code.slice(0, 2);
  return (departments as readonly string[]).includes(dep) ? dep : null;
}
