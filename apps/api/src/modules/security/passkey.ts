// Second facteur prouvé par la **session** (lot 15, corrections après relecture) : une session ouverte par une clé
// d'accès vérifiée porte `second_factor = 'passkey'`, une session ouverte (ou confirmée) par le code de l'application
// d'authentification ou un code de secours porte `'totp'`. L'état du compte (clé enregistrée, TOTP activé) ne suffit
// jamais : il dit seulement quel facteur on peut demander.

export const SECOND_FACTORS = ["passkey", "totp"] as const;
export type SecondFactor = (typeof SECOND_FACTORS)[number];

export const PASSKEY_SIGN_IN_PATH = "/passkey/verify-authentication";
/** Chemins de Better Auth qui vérifient le code TOTP (ou un code de secours). */
export const TOTP_VERIFY_PATHS = [
  "/two-factor/verify-totp",
  "/two-factor/verify-backup-code",
  "/two-factor/verify-otp",
];
/** Chemins qui recréent la session courante : la preuve de l'ancienne session est reportée sur la nouvelle. */
export const CARRY_FACTOR_PATHS = ["/change-password", "/two-factor/disable", "/two-factor/enable"];
/** Amorçage (aucun facteur encore) : session ouverte depuis moins de ce délai. */
export const FRESH_SESSION_MS = 24 * 3_600_000;

export const isSecondFactor = (value: unknown): value is SecondFactor =>
  typeof value === "string" && (SECOND_FACTORS as readonly string[]).includes(value);

/**
 * Second facteur d'une session créée sur ce chemin. `carried` : preuve de la session courante, reportée sur les
 * chemins qui la recréent (changement de mot de passe, activation ou désactivation du TOTP).
 */
export function secondFactorForPath(path: string | null | undefined, carried?: unknown): SecondFactor | null {
  if (path === PASSKEY_SIGN_IN_PATH) return "passkey";
  if (path && TOTP_VERIFY_PATHS.includes(path)) return "totp";
  if (path && CARRY_FACTOR_PATHS.includes(path) && isSecondFactor(carried)) return carried;
  return null;
}

/**
 * Indicateur « utilisateur vérifié » (bit UV, 0x04) des données d'authentificateur WebAuthn, en base64url. Le plugin
 * ne l'exige pas ; une clé utilisée sans vérification (simple présence) ne vaut pas double authentification.
 */
export function userVerified(response: unknown): boolean {
  const data = (response as { response?: { authenticatorData?: unknown } } | null)?.response?.authenticatorData;
  if (typeof data !== "string") return false;
  try {
    const bytes = Buffer.from(data, "base64url");
    return bytes.length > 32 && ((bytes[32] ?? 0) & 0x04) === 0x04;
  } catch {
    return false;
  }
}

/** Message de refus de la connexion par une clé qui n'a pas vérifié l'utilisateur (repris par le site). */
export const USER_VERIFICATION_REQUIRED_MESSAGE = "USER_VERIFICATION_REQUIRED";
