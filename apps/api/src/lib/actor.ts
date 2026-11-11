// L'acteur d'une lecture ou d'une écriture sociale (vague R9, lot R9a, ARCHITECTURE-R8 § 2.9) : « moi », ou une page que je
// tiens, désignée par l'en-tête `X-Orasso-Actor: <clé d'auteur>` (`s:` structure, `p:` fiche pro, `v:` prestataire, `m:` média).
// Absent, vide ou `u:<moi>` : moi. Le serveur ne croit jamais l'en-tête : la clé doit être une page que ce compte gère, et la
// décision passe par `lib/authorship.ts` (le seul endroit qui dit qu'un compte parle au nom d'une page).
//
// - `readActor` (lectures : barre des stories, abonnements, état « suivi » d'une page) : la page doit être dans
//   `managedPageKeys` **sans second facteur** : lire en casquette ne montre que du contenu public.
// - `writeActor` (écritures : suivre au nom d'une page) : `requireAuthorship`, donc le second facteur pour une structure
//   (son erreur remonte telle quelle) ; l'identifiant rendu doit être celui de la clé.
// Clé mal formée, `u:` d'un autre, page non gérée, supprimée ou suspendue : 403 `persona_forbidden`, sans dire si la page
// existe. Seules les routes du lot R9a lisent l'en-tête ; toutes les autres l'ignorent (flamme, signalement, cartes vues,
// messages restent ceux de la personne).
import {
  ACTOR_HEADER,
  type AuthorKey,
  type AuthorKind,
  authorKeyOf,
  pageFollowErrors,
  parseAuthorKey,
} from "@orasso/shared";
import type { Context } from "hono";

import { type AuthorshipInput, managedPageKeys, requireAuthorship } from "./authorship";
import { AppError } from "./errors";
import type { AppEnv, Viewer } from "./session";

/** Qui agit : le compte lui-même (`kind: "user"`) ou une page qu'il tient. */
export type Actor = { kind: AuthorKind; id: string; key: string };

const denied = () => new AppError(403, "persona_forbidden", pageFollowErrors.actorForbidden);

export const isPageActor = (actor: Actor): boolean => actor.kind !== "user";

export const selfActor = (v: Viewer): Actor => ({ kind: "user", id: v.user.id, key: authorKeyOf("user", v.user.id) });

/** La page demandée par l'en-tête, ou `null` quand l'acteur est le compte lui-même. */
function requestedPage(c: Context<AppEnv>, v: Viewer): AuthorKey | null {
  const raw = c.req.header(ACTOR_HEADER)?.trim();
  if (!raw) return null;
  const key = parseAuthorKey(raw);
  if (!key) throw denied();
  if (key.kind === "user") {
    if (key.id !== v.user.id) throw denied();
    return null;
  }
  return key;
}

const authorshipInput = (key: AuthorKey): AuthorshipInput =>
  key.kind === "structure"
    ? { persona: "organizer", structureId: key.id }
    : key.kind === "pro"
      ? { persona: "pro", proId: key.id }
      : { persona: key.kind === "provider" ? "provider" : "media" };

/** Acteur d'une lecture. Le second facteur n'est pas exigé : une lecture en casquette ne sert que du contenu public. */
export async function readActor(c: Context<AppEnv>, v: Viewer): Promise<Actor> {
  const page = requestedPage(c, v);
  if (!page) return selfActor(v);
  if (!(await managedPageKeys(v.user.id)).has(page.key)) throw denied();
  return { kind: page.kind, id: page.id, key: page.key };
}

/** Acteur d'une écriture : `requireAuthorship` (second facteur d'une structure compris). */
export async function writeActor(c: Context<AppEnv>, v: Viewer): Promise<Actor> {
  const page = requestedPage(c, v);
  if (!page) return selfActor(v);
  const a = await requireAuthorship(v, authorshipInput(page));
  // Prestataire et média : l'identifiant vient du serveur (le profil du compte) ; il doit être celui de la clé.
  if (a.kind !== page.kind || a.id !== page.id) throw denied();
  return { kind: a.kind, id: a.id, key: a.key };
}

/** Une réponse qui dépend de l'acteur ne se garde ni dans un cache partagé ni dans celui de l'appareil. */
export function noStore(c: Context<AppEnv>): void {
  c.header("cache-control", "private, no-store");
}
