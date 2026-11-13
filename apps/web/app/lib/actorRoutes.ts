// La liste blanche de l'en-tête `X-Orasso-Actor` côté site (lot R9h, T49, comme T19 de l'appli) : l'en-tête n'est posé que sur ces
// appels, jamais sur toutes les requêtes. Une route de l'API qui lira l'acteur plus tard ne doit pas se mettre à agir au nom d'une
// page par accident. C'est exactement la liste de l'appli (`apps/mobile/src/lib/api/*.ts`, appels qui passent `actor`) : un test
// (`actor.test.ts`) lit les fichiers de l'appli et compare, au caractère près. La flamme, le signalement, les cartes vues, les
// messages et « Publier » (la casquette part dans le corps) n'y sont pas : ils restent au nom de la personne.
import { ACTOR_HEADER } from "@orasso/shared";

export type ActorMethod = "GET" | "POST" | "PUT" | "DELETE";

/** Un appel qui porte l'acteur : sa méthode et son chemin (sans `/api`, `:x` = un segment). */
export type ActorRoute = { method: ActorMethod; path: string };

export const ACTOR_ROUTES: readonly ActorRoute[] = [
  // Le Fil, la barre des stories et les commentaires : lire et commenter au nom de la page.
  { method: "GET", path: "/fil" },
  { method: "GET", path: "/fil/fresh" },
  { method: "GET", path: "/stories/bar" },
  { method: "GET", path: "/feed-posts/:id/comments" },
  { method: "POST", path: "/feed-posts/:id/comments" },
  // Lot R9h (tour 1) : les réponses et les suggestions « @ » se lisent aussi avec les droits de la page.
  { method: "GET", path: "/feed-comments/:id/replies" },
  { method: "GET", path: "/feed-posts/:id/mention-suggestions" },
  // Les pages vues d'une casquette : « suivi » est l'état de la page qui regarde.
  { method: "GET", path: "/structures/by-slug/:slug" },
  { method: "GET", path: "/pros/by-slug/:slug" },
  { method: "GET", path: "/providers/:id" },
  { method: "GET", path: "/media/:id" },
  { method: "GET", path: "/users/:pseudo" },
  // Suivre au nom de la page.
  { method: "POST", path: "/structures/:id/follow" },
  { method: "DELETE", path: "/structures/:id/follow" },
  { method: "POST", path: "/pros/:id/follow" },
  { method: "DELETE", path: "/pros/:id/follow" },
  { method: "POST", path: "/users/:pseudo/follow" },
  { method: "DELETE", path: "/users/:pseudo/follow" },
  { method: "PUT", path: "/me/page-follows/:key" },
  { method: "DELETE", path: "/me/page-follows/:key" },
];

const SEGMENT = "[^/]+";
const matchers = ACTOR_ROUTES.map((r) => ({
  method: r.method,
  re: new RegExp(`^${r.path.replace(/:[a-z]+/g, SEGMENT)}/?$`),
}));

/** Le chemin sans la requête (`/fil?filter=for_you` → `/fil`). */
const pathnameOf = (path: string): string => path.split(/[?#]/, 1)[0] ?? path;

/** Cet appel (méthode, chemin) est-il sur la liste blanche ? */
export function carriesActor(method: string, path: string): boolean {
  const m = method.toUpperCase();
  const p = pathnameOf(path);
  return matchers.some((x) => x.method === m && x.re.test(p));
}

/**
 * Les en-têtes d'acteur d'un appel : `x-orasso-actor` seulement si l'acteur est non nul **et** que l'appel est sur la liste
 * blanche ; sinon rien (l'option `actor` d'un appel qui n'y est pas est ignorée).
 */
export function actorHeaders(method: string, path: string, actor: string | null | undefined): Record<string, string> {
  return actor && carriesActor(method, path) ? { [ACTOR_HEADER]: actor } : {};
}
