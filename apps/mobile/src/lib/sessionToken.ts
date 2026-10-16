// Nouveau jeton de session après un changement de session de Better Auth (logique pure, testée sans React Native).
/**
 * Seul l'en-tête `set-auth-token` donne le jeton de la nouvelle session. Le `token` du corps (verify-totp à
 * l'activation) est celui de l'ancienne session, déjà supprimée : ne jamais l'adopter.
 */
export function newSessionToken(headers: Pick<Headers, "get">): string | null {
  return headers.get("set-auth-token");
}
