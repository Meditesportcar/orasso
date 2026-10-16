// Sécurité du compte (lot 16) : mot de passe oublié, changement de mot de passe, double authentification TOTP.
// Ce sont les routes de Better Auth (`/api/auth/*`), appelées avec le jeton de la session. Les clés d'accès
// (passkeys) restent sur le site (S2) : pas de module WebAuthn natif en V1.
import { request, requestWithHeaders } from "../http";

/**
 * Better Auth remplace la session quand le mot de passe change, que la double authentification est activée ou
 * désactivée : le nouveau jeton arrive dans l'en-tête `set-auth-token` (ou dans le corps). L'appli doit l'adopter
 * (`adoptToken` de la session), sinon elle est déconnectée au prochain appel. `null` : la session n'a pas changé.
 */
async function sessionToken(path: string, body: unknown): Promise<string | null> {
  const { data, headers } = await requestWithHeaders<{ token?: string } | null>(path, { method: "POST", body });
  return headers.get("set-auth-token") ?? data?.token ?? null;
}

export type TotpEnrollment = { totpURI: string; backupCodes: string[] };

export const securityApi = {
  /** Envoie le lien de réinitialisation (la suite se fait sur le site). La réponse est la même que l'adresse existe ou non. */
  requestPasswordReset: (email: string) =>
    request<unknown>("/api/auth/request-password-reset", {
      method: "POST",
      body: { email, redirectTo: "/reinitialisation" },
    }),
  /** Les autres appareils sont déconnectés par l'API (alerte « mot de passe changé » comprise). Renvoie le nouveau jeton. */
  changePassword: (currentPassword: string, newPassword: string) =>
    sessionToken("/api/auth/change-password", { currentPassword, newPassword, revokeOtherSessions: true }),
  /** Étape 1 : mot de passe → clé (URI `otpauth://`) et codes de secours. Rien n'est actif avant l'étape 2. */
  enableTwoFactor: (password: string) =>
    request<TotpEnrollment>("/api/auth/two-factor/enable", { method: "POST", body: { password } }),
  /** Étape 2 : premier code de l'application d'authentification, ce qui active la double authentification. Renvoie le nouveau jeton. */
  verifyTotp: (code: string) => sessionToken("/api/auth/two-factor/verify-totp", { code: code.replace(/\s+/g, "") }),
  /** Renvoie le nouveau jeton. */
  disableTwoFactor: (password: string) => sessionToken("/api/auth/two-factor/disable", { password }),
  /** Nouveaux codes de secours (les anciens ne servent plus). */
  regenerateBackupCodes: (password: string) =>
    request<{ backupCodes: string[] }>("/api/auth/two-factor/generate-backup-codes", {
      method: "POST",
      body: { password },
    }),
};
