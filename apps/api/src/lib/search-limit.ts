// Limite de débit des recherches par texte (lot 29) : par personne connectée, par adresse pour un visiteur sans compte.
// Servie à `GET /search` et aux listes `GET /events` et `GET /pros` quand elles reçoivent un texte (`q`).

import { rateLimit } from "./rateLimit";
import type { Viewer } from "./session";

/** Adresse du visiteur (posée par nginx / le rendu serveur du site), sinon un repère commun. */
const visitorOf = (c: { req: { header(name: string): string | undefined } }) =>
  c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "direct";

export function limitSearch(c: { req: { header(name: string): string | undefined } }, viewer: Viewer | null): void {
  if (viewer) rateLimit("search", viewer.user.id);
  else rateLimit("searchPublic", visitorOf(c));
}
