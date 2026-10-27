import type { NotificationFamily } from "../enums";

/**
 * Social (lot 17 ; lot R6b : « Suivre » remplace l'amitié) : abonnements et fil d'actualité du Journal. Famille `social`
 * (se coupe comme les autres). Les demandes partent en push ; les types « actualité » n'en ont jamais (voir
 * `journalOnlyNotificationTypes`). `friend_request` et `friend_accepted` ne sont plus envoyées : les notifications déjà
 * reçues restent lisibles dans la Boîte. Les noms `friend_going_event` et `friend_new_vehicle` restent (données en base) :
 * ils visent désormais les abonnés acceptés.
 */
export const socialNotificationTypes = {
  friend_request: "social",
  friend_accepted: "social",
  friend_going_event: "social",
  friend_new_vehicle: "social",
  /** Lot R4c : « Kenji_66 te suit », regroupée (une ligne non lue complétée au lieu d'une nouvelle). */
  user_followed: "social",
  /** Lot R6b : « Kenji_66 demande à te suivre » (compte privé). */
  follow_request: "social",
  /** Lot R6b : « Julie_66 a accepté ta demande ». */
  follow_accepted: "social",
  /**
   * Lot R6c : « Kenji_66 t'invite à Nocturne de Canet », regroupée par événement (« Kenji_66 et Julie_66 t'invitent »).
   * Revérifiée à la livraison (garde) : événement encore visible et à venir, invité qui n'y va pas, pas coupé.
   */
  event_invited: "social",
} as const satisfies Record<string, NotificationFamily>;

/** Items d'actualité du Journal : ni push, ni e-mail, livrés tout de suite (ARCHITECTURE-SUITE § 2.4). */
export const journalOnlyNotificationTypes: readonly string[] = ["friend_going_event", "friend_new_vehicle"];

/** Libellés des types (réglages des notifications). */
export const socialNotificationLabels: Record<keyof typeof socialNotificationTypes, string> = {
  friend_request: "Ancienne demande d'ami",
  friend_accepted: "Ancienne demande d'ami acceptée",
  friend_going_event: "Une personne que tu suis va à un événement",
  friend_new_vehicle: "Une personne que tu suis ajoute un véhicule",
  user_followed: "Nouvel abonné",
  follow_request: "Demande d'abonnement",
  follow_accepted: "Demande d'abonnement acceptée",
  event_invited: "Invitations à un événement",
};

/**
 * Lot R4c : un nouvel abonné ne vaut pas un e-mail (push et Journal seulement). Lot R6c : une invitation entre passionnés
 * non plus (aucun courrier déclenché par un autre membre).
 */
export const socialNoEmailTypes: readonly string[] = ["user_followed", "event_invited"];
