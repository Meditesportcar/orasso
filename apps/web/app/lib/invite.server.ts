// Lien de profil `/ami/:jeton` (lot 15, ARCHITECTURE-SUITE § 1.3) : sans compte, le jeton est gardé 24 h dans le cookie
// `orasso-invite`, puis rattaché au compte créé (`POST /me/referral`) juste après l'inscription.
import { api } from "./api.server";

export const INVITE_COOKIE = "orasso-invite";
const MAX_AGE = 24 * 3600;

export function readInviteCookie(request: Request): string | null {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === INVITE_COOKIE) {
      const value = decodeURIComponent(rest.join("="));
      return /^[A-Za-z0-9_-]{8,64}$/.test(value) ? value : null;
    }
  }
  return null;
}

function secure(request: Request) {
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  return proto === "https" ? "; Secure" : "";
}

export function setInviteCookie(request: Request, token: string): string {
  return `${INVITE_COOKIE}=${encodeURIComponent(token)}; Max-Age=${MAX_AGE}; Path=/; HttpOnly; SameSite=Lax${secure(request)}`;
}

export function clearInviteCookie(request: Request): string {
  return `${INVITE_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure(request)}`;
}

/**
 * Après une inscription : rattache le parrain si un lien de profil a été ouvert, puis efface le cookie. Sans effet (et
 * sans erreur) si le lien ne s'applique pas (compte trop ancien, propre lien…).
 */
export async function applyInviteAfterSignup(request: Request, sessionCookie: string, headers: Headers) {
  const token = readInviteCookie(request);
  if (!token) return;
  await api(request, "/me/referral", { method: "POST", json: { token }, cookie: sessionCookie });
  headers.append("set-cookie", clearInviteCookie(request));
}
