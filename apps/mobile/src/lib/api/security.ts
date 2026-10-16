// Sécurité du compte (lot 16) : mot de passe oublié, changement de mot de passe, double authentification TOTP.
// Ce sont les routes de Better Auth (`/api/auth/*`), appelées avec le jeton de la session. Les clés d'accès
// (passkeys) restent sur le site (S2) : pas de module WebAuthn natif en V1.
import { request } from "../http";

export type TotpEnrollment = { totpURI: string; backupCodes: string[] };

export const securityApi = {
  /** Envoie le lien de réinitialisation (la suite se fait sur le site). La réponse est la même que l'adresse existe ou non. */
  requestPasswordReset: (email: string) =>
    request<unknown>("/api/auth/request-password-reset", {
      method: "POST",
      body: { email, redirectTo: "/reinitialisation" },
    }),
  /** Les autres appareils sont déconnectés par l'API (alerte « mot de passe changé » comprise). */
  changePassword: (currentPassword: string, newPassword: string) =>
    request<unknown>("/api/auth/change-password", {
      method: "POST",
      body: { currentPassword, newPassword, revokeOtherSessions: true },
    }),
  /** Étape 1 : mot de passe → clé (URI `otpauth://`) et codes de secours. Rien n'est actif avant l'étape 2. */
  enableTwoFactor: (password: string) =>
    request<TotpEnrollment>("/api/auth/two-factor/enable", { method: "POST", body: { password } }),
  /** Étape 2 : premier code de l'application d'authentification, ce qui active la double authentification. */
  verifyTotp: (code: string) =>
    request<unknown>("/api/auth/two-factor/verify-totp", { method: "POST", body: { code: code.replace(/\s+/g, "") } }),
  disableTwoFactor: (password: string) =>
    request<unknown>("/api/auth/two-factor/disable", { method: "POST", body: { password } }),
  /** Nouveaux codes de secours (les anciens ne servent plus). */
  regenerateBackupCodes: (password: string) =>
    request<{ backupCodes: string[] }>("/api/auth/two-factor/generate-backup-codes", {
      method: "POST",
      body: { password },
    }),
};
