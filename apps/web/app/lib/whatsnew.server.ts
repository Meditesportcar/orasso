// Bandeau « où sont passées les choses » du site (lot R7a1, D38) : montré une seule fois après la mise à jour, en haut de
// l'Accueil (`/app`), puis plus jamais. Le ✕ écrit un cookie de préférence `whatsnew_r7=vu`, **par navigateur** : aucun
// identifiant de compte, aucun secret, aucune donnée personnelle (tour 3). Deux comptes sur le même navigateur : le
// bandeau ne s'y montre qu'une fois (accepté, voir le journal des choix).
export const WHATSNEW_COOKIE = "whatsnew_r7";
const MAX_AGE = 400 * 24 * 3600;
const SEEN = "vu";

/** Ce navigateur a-t-il déjà dit « Compris » ? */
export function whatsNewSeen(request: Request): boolean {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === WHATSNEW_COOKIE) return rest.join("=") === SEEN;
  }
  return false;
}

function secure(request: Request) {
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  return proto === "https" ? "; Secure" : "";
}

/** `Set-Cookie` qui note que ce navigateur a vu le bandeau. */
export function whatsNewSeenCookie(request: Request): string {
  return `${WHATSNEW_COOKIE}=${SEEN}; Max-Age=${MAX_AGE}; Path=/; HttpOnly; SameSite=Lax${secure(request)}`;
}
