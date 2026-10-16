import type { NotificationFamily } from "../enums";

/**
 * Messagerie (lot 18) : famille `social` (« Amis et messages »). `message_received` part en push seulement (hors
 * Journal, jamais par e-mail : la Boîte et sa pastille suffisent, et un e-mail par message serait du bruit) ;
 * `contact_request` arrive au Journal comme une demande d'ami.
 */
export const messagingNotificationTypes = {
  message_received: "social",
  contact_request: "social",
} as const satisfies Record<string, NotificationFamily>;

/** Types livrés en push seulement : jamais d'e-mail de repli, même sans appareil enregistré. */
export const pushOnlyNotificationTypes: readonly string[] = ["message_received"];

export const messagingNotificationLabels: Record<keyof typeof messagingNotificationTypes, string> = {
  message_received: "Nouveau message",
  contact_request: "Demande de contact",
};
