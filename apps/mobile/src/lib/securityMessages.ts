// Messages en français des erreurs de la sécurité du compte (Better Auth et API), pour l'écran Moi. Logique pure.
import { PASSWORD_MIN_LENGTH } from "@orasso/shared";

import { ApiRequestError, errorMessage } from "./http";

const byCode: Record<string, string> = {
  INVALID_PASSWORD: "Mot de passe incorrect.",
  PASSWORD_TOO_SHORT: `Le nouveau mot de passe est trop court (${PASSWORD_MIN_LENGTH} caractères au moins).`,
  PASSWORD_TOO_LONG: "Le nouveau mot de passe est trop long.",
  INVALID_CODE: "Code incorrect. Réessaie avec le code affiché maintenant.",
  INVALID_BACKUP_CODE: "Code de secours incorrect.",
  TWO_FACTOR_REQUIRED:
    "Reconnecte-toi avec ton code de double authentification pour modifier tes facteurs, puis recommence.",
  SESSION_NOT_FRESH: "Reconnecte-toi d'abord (déconnexion, puis connexion), puis recommence.",
  TOTP_NOT_ENABLED: "La double authentification n'est pas encore activée sur ce compte.",
  CREDENTIAL_ACCOUNT_NOT_FOUND: "Ce compte n'a pas de mot de passe (il se connecte avec Google ou Apple).",
};

export function securityErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    if (error.isNetwork) return error.message;
    const known = byCode[error.code];
    if (known) return known;
    if (error.status === 429) return "Trop d'essais : réessaie dans un instant.";
  }
  return errorMessage(error);
}
