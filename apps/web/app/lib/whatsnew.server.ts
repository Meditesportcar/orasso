// Bandeau « où sont passées les choses » du site (lot R7a1, D38) : montré une seule fois après la mise à jour, en haut de
// l'Accueil (`/app`), puis plus jamais. Le « Compris » écrit un cookie de préférence `whatsnew_r7` ; comme celui de
// l'Explorer, il porte un identifiant opaque du compte (un haché, jamais l'identifiant lui-même). Plusieurs comptes sur
// le même navigateur : le cookie garde les derniers, pour qu'un compte qui a dit « Compris » ne revoie pas le bandeau
// parce qu'un autre s'est connecté entre-temps.
import { createHash } from "node:crypto";

export const WHATSNEW_COOKIE = "whatsnew_r7";
const MAX_AGE = 400 * 24 * 3600;
const OWNER = /^[0-9a-f]{16}$/;
/** Comptes gardés dans le cookie (le plus ancien tombe). */
const MAX_OWNERS = 8;

/** Identifiant opaque du compte dans le cookie (16 caractères hexadécimaux). */
export function whatsNewOwner(userId: string): string {
  return createHash("sha256").update(`orasso-whatsnew-r7:${userId}`).digest("hex").slice(0, 16);
}

/** Les comptes du cookie (valeurs illisibles ignorées). */
export function whatsNewOwners(request: Request): string[] {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === WHATSNEW_COOKIE)
      return rest
        .join("=")
        .split(".")
        .filter((o) => OWNER.test(o));
  }
  return [];
}

/** Ce compte a-t-il déjà dit « Compris » ? */
export function whatsNewSeen(request: Request, userId: string): boolean {
  return whatsNewOwners(request).includes(whatsNewOwner(userId));
}

function secure(request: Request) {
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  return proto === "https" ? "; Secure" : "";
}

/** `Set-Cookie` qui ajoute ce compte à ceux qui ont vu le bandeau. */
export function whatsNewSeenCookie(request: Request, userId: string): string {
  const owner = whatsNewOwner(userId);
  const kept = [...whatsNewOwners(request).filter((o) => o !== owner), owner].slice(-MAX_OWNERS);
  return `${WHATSNEW_COOKIE}=${kept.join(".")}; Max-Age=${MAX_AGE}; Path=/; HttpOnly; SameSite=Lax${secure(request)}`;
}
