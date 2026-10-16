import type { NotificationFamily } from "../enums";

/** Sécurité du compte (lot 15) : famille `account`, jamais coupée, e-mail toujours. */
export const accountNotificationTypes = {
  security_new_login: "account",
  security_password_changed: "account",
  account_deleted: "account",
} as const satisfies Record<string, NotificationFamily>;

export const accountEmailAlwaysTypes = ["security_new_login", "security_password_changed", "account_deleted"] as const;

/** Libellés des types (réglages des notifications). */
export const accountNotificationLabels: Record<keyof typeof accountNotificationTypes, string> = {
  security_new_login: "Nouvelle connexion",
  security_password_changed: "Mot de passe changé",
  account_deleted: "Compte supprimé",
};
