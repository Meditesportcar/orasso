// Cookies de Better Auth repris des en-têtes `set-cookie` (étape « code » et appareil de confiance de la double
// authentification, lot 15). Logique pure, testée sans React Native.

/** Extrait `nom=valeur` d'un cookie de Better Auth dans l'en-tête `set-cookie` (plusieurs cookies possibles). */
export function pickCookie(setCookie: string | null, name: string): string | null {
  if (!setCookie) return null;
  const match = new RegExp(`((?:__Secure-)?better-auth\\.${name}=[^;,\\s]*)`).exec(setCookie);
  const pair = match?.[1];
  if (!pair || pair.endsWith("=")) return null;
  return pair;
}

/**
 * En-tête `Origin` des appels natifs à `/api/auth/*` : origine de l'API (`EXPO_PUBLIC_API_URL`), qui doit figurer dans les
 * `trustedOrigins` de Better Auth (`PUBLIC_URL` en ligne : même hôte que l'API ; `CORS_ORIGINS` en développement).
 */
export function authOriginHeader(path: string, isNative: boolean, apiBase: string): Record<string, string> {
  if (!isNative || !path.startsWith("/api/auth/")) return {};
  try {
    return { origin: new URL(apiBase).origin };
  } catch {
    return {};
  }
}
