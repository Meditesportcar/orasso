// Enrôlement TOTP : lecture de l'URI otpauth:// renvoyée par Better Auth (logique pure, testée sans React Native).
/** Clé de l'URI `otpauth://totp/…?secret=ABCD…` à saisir à la main, en groupes de quatre. */
export function totpSecretOf(uri: string): string {
  const secret = /[?&]secret=([^&]+)/i.exec(uri)?.[1] ?? "";
  return decodeURIComponent(secret)
    .replace(/(.{4})/g, "$1 ")
    .trim();
}
