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
