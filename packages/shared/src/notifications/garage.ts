import type { NotificationFamily } from "../enums";

/**
 * Garage (lot 31). Le transfert de plaque se passe entre deux comptes : famille `social` ; la certification se rattache
 * au grade : famille `grade`.
 */
export const garageNotificationTypes = {
  plate_transfer_request: "social",
  plate_transfer_accepted: "social",
  plate_transfer_arbitrated: "social",
  plate_transfer_refused: "social",
  certification_accepted: "grade",
  certification_refused: "grade",
  certification_lost: "grade",
} as const satisfies Record<string, NotificationFamily>;

/** Libellés des types (réglages des notifications). */
export const garageNotificationLabels: Record<keyof typeof garageNotificationTypes, string> = {
  plate_transfer_request: "Demande de transfert de plaque",
  plate_transfer_accepted: "Transfert de plaque accepté",
  plate_transfer_arbitrated: "Transfert de plaque confié à l'équipe",
  plate_transfer_refused: "Transfert de plaque refusé",
  certification_accepted: "Véhicule certifié",
  certification_refused: "Certification refusée",
  certification_lost: "Certification perdue",
};
