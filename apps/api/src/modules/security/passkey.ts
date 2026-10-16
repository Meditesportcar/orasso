// Clé d'accès comme second facteur (lot 15, corrections après relecture) : la double authentification obligatoire est
// prouvée par la **session**, pas par l'état du compte. Une session ouverte par `/passkey/verify-authentication`, avec
// vérification de l'utilisateur (Face ID, empreinte, code de l'appareil), porte `second_factor = 'passkey'`.

export const PASSKEY_SIGN_IN_PATH = "/passkey/verify-authentication";
/** Suppression ou ajout d'une clé : session ouverte depuis moins de ce délai. */
export const PASSKEY_FRESH_SESSION_MS = 24 * 3_600_000;

/** Second facteur porté par une session créée sur ce chemin de Better Auth (`null` : aucun). */
export function secondFactorForPath(path: string | null | undefined): "passkey" | null {
  return path === PASSKEY_SIGN_IN_PATH ? "passkey" : null;
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
