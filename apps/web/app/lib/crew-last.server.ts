// Dernier crew ouvert dans l'onglet Crew du site (lot R7b2, D38) : « le dernier ouvert revient ». Cookie de préférence
// `crew_last`, rangé par compte comme celui de l'Explorer et du bandeau `whatsnew_r7` : chaque entrée est un identifiant
// opaque du compte (un haché, jamais l'identifiant lui-même) suivi de l'adresse du crew. Plusieurs comptes sur le même
// navigateur : le cookie garde les derniers, chacun retrouve son crew. Le cookie ne donne aucun droit : l'API décide de ce
// que je vois, et un crew dont je ne suis plus membre n'est jamais montré (`pickCrew`).
import { createHash } from "node:crypto";
import type { MyCrew } from "@orasso/shared";

export const CREW_LAST_COOKIE = "crew_last";
const MAX_AGE = 400 * 24 * 3600;
const ENTRY = /^([0-9a-f]{16})~([a-z0-9-]{1,80})$/;
/** Comptes gardés dans le cookie (le plus ancien tombe). */
const MAX_OWNERS = 8;

/** Identifiant opaque du compte dans le cookie (16 caractères hexadécimaux). */
export function crewLastOwner(userId: string): string {
  return createHash("sha256").update(`orasso-crew-last:${userId}`).digest("hex").slice(0, 16);
}

function entries(request: Request): { owner: string; slug: string }[] {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== CREW_LAST_COOKIE) continue;
    return rest
      .join("=")
      .split(".")
      .flatMap((e) => {
        const m = ENTRY.exec(e);
        return m ? [{ owner: m[1] as string, slug: m[2] as string }] : [];
      });
  }
  return [];
}

/** L'adresse du dernier crew ouvert par ce compte, ou `null`. */
export function crewLastOf(request: Request, userId: string): string | null {
  const owner = crewLastOwner(userId);
  return entries(request).find((e) => e.owner === owner)?.slug ?? null;
}

/** Le crew à montrer : celui du lien, sinon le dernier ouvert, sinon le premier ; jamais un crew qui n'est plus le mien. */
export function pickCrew(crews: readonly MyCrew[], wanted: string | null, last: string | null): MyCrew | null {
  for (const slug of [wanted, last]) {
    const hit = slug ? crews.find((c) => c.slug === slug) : undefined;
    if (hit) return hit;
  }
  return crews[0] ?? null;
}

function secure(request: Request) {
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", "");
  return proto === "https" ? "; Secure" : "";
}

/** `Set-Cookie` qui range ce crew comme dernier ouvert de ce compte. */
export function crewLastCookie(request: Request, userId: string, slug: string): string {
  const owner = crewLastOwner(userId);
  const kept = [...entries(request).filter((e) => e.owner !== owner), { owner, slug }].slice(-MAX_OWNERS);
  return `${CREW_LAST_COOKIE}=${kept.map((e) => `${e.owner}~${e.slug}`).join(".")}; Max-Age=${MAX_AGE}; Path=/; HttpOnly; SameSite=Lax${secure(request)}`;
}
