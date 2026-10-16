import type { NotificationFamily } from "../enums";

/**
 * Invitations nominatives (lot 25, ARCHITECTURE-SUITE § 9.1, § 17.3) : l'invitation reçue est du social (« invitation à
 * un événement », docs/01 « Notifications ») ; l'organisateur est prévenu quand un invité accepte un événement complet
 * et passe en tête de la liste d'attente (S25).
 */
export const invitationNotificationTypes = {
  event_invitation_received: "social",
  invitation_capacity_blocked: "event",
} as const satisfies Record<string, NotificationFamily>;

export const invitationNotificationLabels: Record<keyof typeof invitationNotificationTypes, string> = {
  event_invitation_received: "Invitation à un événement",
  invitation_capacity_blocked: "Invité en liste d'attente faute de place",
};
