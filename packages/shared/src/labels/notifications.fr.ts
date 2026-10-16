import type { NotificationFamily, NotificationType } from "../enums";
import { accountNotificationLabels } from "../notifications/account";
import { applicationNotificationLabels } from "../notifications/application";
import { eventNotificationLabels } from "../notifications/events";
import { pointsNotificationLabels } from "../notifications/points";
import { socialNotificationLabels } from "../notifications/social";
import { staffNotificationLabels } from "../notifications/staff";

// Notifications (lot 15) : familles et types, pour les réglages du compte. Les libellés des types sont déclarés à
// côté de chaque type (`notifications/<domaine>.ts`) et réunis ici par un spread par domaine.

export const notificationFamilyLabels: Record<NotificationFamily, string> = {
  application: "Candidatures",
  event: "Événements",
  social: "Amis et messages",
  grade: "Points et grade",
  staff: "Staff",
  account: "Sécurité du compte",
};

export const notificationTypeLabels: Record<NotificationType, string> = {
  ...applicationNotificationLabels,
  ...eventNotificationLabels,
  ...staffNotificationLabels,
  ...pointsNotificationLabels,
  ...accountNotificationLabels,
  ...socialNotificationLabels,
};
