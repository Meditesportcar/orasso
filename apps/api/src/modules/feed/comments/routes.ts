// Routes des commentaires d'une publication du Fil (lot R8k1). Toutes exigent une session : aucun commentaire n'est jamais
// servi à un visiteur sans compte (T4). Chaque route commence, dans le service, par `requireVisiblePost`.
import {
  feedCommentCreateSchema,
  feedCommentReportSchema,
  feedCommentsOffSchema,
  feedCommentsQuery,
  mentionSuggestionsQuery,
} from "@orasso/shared";
import { Hono } from "hono";

import { readActor, writeActor } from "../../../lib/actor";
import { type AppEnv, requireUser } from "../../../lib/session";
import { body, query, uuidParam } from "../../../lib/validate";
import "./batch";
import "./last";
import { feedCommentsService } from "./service";

export const feedCommentRoutes = new Hono<AppEnv>()
  .get("/feed-posts/:id/comments", async (c) => {
    const v = await requireUser(c);
    c.header("cache-control", "private, no-store");
    return c.json(await feedCommentsService.list(v, uuidParam(c, "id"), query(c, feedCommentsQuery).cursor));
  })
  .post("/feed-posts/:id/comments", async (c) => {
    const v = await requireUser(c);
    // Vague R9 (lot R9a, T7) : au nom d'une page quand l'en-tête la désigne ; le corps de la requête ne change pas.
    const actor = await writeActor(c, v);
    c.header("cache-control", "private, no-store");
    return c.json(
      await feedCommentsService.create(v, uuidParam(c, "id"), await body(c, feedCommentCreateSchema), actor),
      201,
    );
  })
  .get("/feed-posts/:id/mention-suggestions", async (c) => {
    const v = await requireUser(c);
    c.header("cache-control", "private, no-store");
    const actor = await readActor(c, v);
    return c.json(
      await feedCommentsService.suggestions(v, uuidParam(c, "id"), query(c, mentionSuggestionsQuery).q, actor),
    );
  })
  .put("/me/feed-posts/:id/comments-off", async (c) => {
    const v = await requireUser(c);
    const { off } = await body(c, feedCommentsOffSchema);
    return c.json(await feedCommentsService.setCommentsOff(v, uuidParam(c, "id"), off));
  })
  .get("/feed-comments/:id/replies", async (c) => {
    const v = await requireUser(c);
    c.header("cache-control", "private, no-store");
    return c.json(await feedCommentsService.replies(v, uuidParam(c, "id"), query(c, feedCommentsQuery).cursor));
  })
  .delete("/feed-comments/:id", async (c) => {
    const done = await feedCommentsService.remove(await requireUser(c), uuidParam(c, "id"));
    // 204 comme avant ; une réponse supprimée rend 200 avec le compteur de son parent (champ ajouté).
    return done.parent ? c.json(done) : c.body(null, 204);
  })
  .put("/feed-comments/:id/reaction", async (c) =>
    c.json(await feedCommentsService.react(await requireUser(c), uuidParam(c, "id"), true)),
  )
  .delete("/feed-comments/:id/reaction", async (c) =>
    c.json(await feedCommentsService.react(await requireUser(c), uuidParam(c, "id"), false)),
  )
  .post("/feed-comments/:id/report", async (c) => {
    const v = await requireUser(c);
    const input = await body(c, feedCommentReportSchema);
    return c.json(
      await feedCommentsService.report(v, uuidParam(c, "id"), {
        reason: input.reason,
        details: input.details ?? null,
      }),
      201,
    );
  });
