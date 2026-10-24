import type { NotificationFamily } from "../enums";

/**
 * Social (lot 17) : demandes d'ami et fil d'actualité du Journal. Famille `social` (se coupe comme les autres).
 * `friend_request` et `friend_accepted` partent en push ; les types « actualité » n'en ont jamais (voir
 * `journalOnlyNotificationTypes`).
 */
export const socialNotificationTypes = {
  friend_request: "social",
  friend_accepted: "social",
  friend_going_event: "social",
  friend_new_vehicle: "social",
  /** Lot R4c : « Kenji_66 te suit », regroupée (une ligne non lue complétée au lieu d'une nouvelle). */
  user_followed: "social",
} as const satisfies Record<string, NotificationFamily>;

/** Items d'actualité du Journal : ni push, ni e-mail, livrés tout de suite (ARCHITECTURE-SUITE § 2.4). */
export const journalOnlyNotificationTypes: readonly string[] = ["friend_going_event", "friend_new_vehicle"];

/** Libellés des types (réglages des notifications). */
export const socialNotificationLabels: Record<keyof typeof socialNotificationTypes, string> = {
  friend_request: "Demande d'ami",
  friend_accepted: "Demande d'ami acceptée",
  friend_going_event: "Un ami va à un événement",
  friend_new_vehicle: "Un ami ajoute un véhicule",
  user_followed: "Nouvel abonné",
};

/** Lot R4c : un nouvel abonné ne vaut pas un e-mail (push et Journal seulement). */
export const socialNoEmailTypes: readonly string[] = ["user_followed"];
