// Routes de la collaboration (vague R8, lot R8o) : chercher un co-auteur, répondre à une invitation, se retirer. Inviter se
// fait à la création (`POST /me/feed-posts` + `coAuthor`). Toutes exigent une session.
import { coAuthorSearchQuery } from "@orasso/shared";
import { Hono } from "hono";

import { type AppEnv, requireUser } from "../../lib/session";
import { query, uuidParam } from "../../lib/validate";
import { coauthorsService } from "./coauthors";

export const coauthorRoutes = new Hono<AppEnv>()
  // `GET /me/feed-posts/coauthor-search?q=&kind=` → `{ items: [{ key, kind, name, avatarUrl, verified, partner }] }`
  .get("/me/feed-posts/coauthor-search", async (c) => {
    const v = await requireUser(c);
    c.header("cache-control", "private, no-store");
    return c.json(await coauthorsService.search(v, query(c, coAuthorSearchQuery)));
  })
  .post("/me/feed-coauthor-requests/:postId/accept", async (c) => {
    const v = await requireUser(c);
    return c.json(await coauthorsService.respond(v, uuidParam(c, "postId"), "accept"));
  })
  .post("/me/feed-coauthor-requests/:postId/decline", async (c) => {
    const v = await requireUser(c);
    return c.json(await coauthorsService.respond(v, uuidParam(c, "postId"), "decline"));
  })
  // « Me retirer » (le co-auteur) ou annuler l'invitation / retirer le co-auteur (l'auteur d'origine).
  .delete("/feed-posts/:id/coauthor", async (c) => {
    const v = await requireUser(c);
    return c.json(await coauthorsService.withdraw(v, uuidParam(c, "id")));
  });
