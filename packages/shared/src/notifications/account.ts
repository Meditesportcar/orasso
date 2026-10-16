import type { NotificationFamily } from "../enums";

/** Sécurité du compte (lot 15) : famille `account`, jamais coupée, e-mail toujours, livrée tout de suite. */
export const accountNotificationTypes = {
  security_new_login: "account",
  security_password_changed: "account",
  account_deleted: "account",
  security_passkey_added: "account",
  security_passkey_removed: "account",
  security_two_factor_enabled: "account",
  security_two_factor_disabled: "account",
} as const satisfies Record<string, NotificationFamily>;

export const accountEmailAlwaysTypes = [
  "security_new_login",
  "security_password_changed",
  "account_deleted",
  "security_passkey_added",
  "security_passkey_removed",
  "security_two_factor_enabled",
  "security_two_factor_disabled",
] as const;

/** Libellés des types (réglages des notifications). */
export const accountNotificationLabels: Record<keyof typeof accountNotificationTypes, string> = {
  security_new_login: "Nouvelle connexion",
  security_password_changed: "Mot de passe changé",
  account_deleted: "Compte supprimé",
  security_passkey_added: "Clé d'accès ajoutée",
  security_passkey_removed: "Clé d'accès supprimée",
  security_two_factor_enabled: "Double authentification activée",
  security_two_factor_disabled: "Double authentification désactivée",
};
