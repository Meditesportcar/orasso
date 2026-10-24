// Limite de débit des recherches par texte (lot 29) : par personne connectée, par adresse pour un visiteur sans compte.
// Servie à `GET /search` et aux listes `GET /events` et `GET /pros` quand elles reçoivent un texte (`q`).

import { type RateRuleName, rateLimit } from "./rateLimit";
import type { Viewer } from "./session";

/** Adresse du visiteur (posée par nginx / le rendu serveur du site), sinon un repère commun. */
export const visitorOf = (c: { req: { header(name: string): string | undefined } }) => {
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  if (!ip) return "direct";
  // IPv6 : un visiteur dispose d'un préfixe /64 entier ; on compte par préfixe, pas par adresse.
  return ip.includes(":") ? ipv6Prefix64(ip) : ip;
};

/** Les quatre premiers groupes d'une adresse IPv6 (/64), « :: » développé. */
export function ipv6Prefix64(ip: string): string {
  const [head = "", tail] = ip.split("::");
  const a = head.split(":").filter(Boolean);
  const b = tail === undefined ? [] : tail.split(":").filter(Boolean);
  const groups = tail === undefined ? a : [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill("0"), ...b];
  return groups
    .slice(0, 4)
    .map((g) => g.toLowerCase().replace(/^0+(?=.)/, ""))
    .join(":");
}

/** Règles par défaut : la recherche de premier niveau ; une autre recherche peut passer les siennes (lot R3c). */
export function limitSearch(
  c: { req: { header(name: string): string | undefined } },
  viewer: Viewer | null,
  rules: { user: RateRuleName; visitor: RateRuleName } = { user: "search", visitor: "searchPublic" },
): void {
  if (viewer) rateLimit(rules.user, viewer.user.id);
  else rateLimit(rules.visitor, visitorOf(c));
}
