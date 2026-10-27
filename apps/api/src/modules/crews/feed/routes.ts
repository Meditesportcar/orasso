// Routes du fil d'un crew (lot R5c1). Toutes réservées aux membres actifs du crew (404 sinon, comme un crew inconnu).
import { crewCommentCreateSchema, crewFeedQuery, crewPollVoteSchema, crewPostCreateSchema } from "@orasso/shared";
import { Hono } from "hono";

import { type AppEnv, requireUser } from "../../../lib/session";
import { body, query, uuidParam } from "../../../lib/validate";
import { crewPhotoForModeration } from "../../moderation/targets/crewFeed";
import { crewFeedService } from "./service";

export const crewFeedRoutes = new Hono<AppEnv>()
  .get("/crews/:id/feed", async (c) => {
    const v = await requireUser(c);
    return c.json(await crewFeedService.feed(v, uuidParam(c, "id"), query(c, crewFeedQuery).cursor));
  })
  .get("/crews/:id/post-options", async (c) =>
    c.json(await crewFeedService.postOptions(await requireUser(c), uuidParam(c, "id"))),
  )
  .post("/crews/:id/posts", async (c) => {
    const v = await requireUser(c);
    return c.json(await crewFeedService.create(v, uuidParam(c, "id"), await body(c, crewPostCreateSchema)), 201);
  })
  // Lot R6a : une publication relue à un signal du canal `crew:<id>`.
  .get("/crews/:id/posts/:postId", async (c) =>
    c.json(await crewFeedService.post(await requireUser(c), uuidParam(c, "id"), uuidParam(c, "postId"))),
  )
  .delete("/crews/:id/posts/:postId", async (c) => {
    await crewFeedService.remove(await requireUser(c), uuidParam(c, "id"), uuidParam(c, "postId"));
    return c.body(null, 204);
  })
  .put("/crews/:id/posts/:postId/reaction", async (c) =>
    c.json(await crewFeedService.fire(await requireUser(c), uuidParam(c, "id"), uuidParam(c, "postId"), true)),
  )
  .delete("/crews/:id/posts/:postId/reaction", async (c) =>
    c.json(await crewFeedService.fire(await requireUser(c), uuidParam(c, "id"), uuidParam(c, "postId"), false)),
  )
  .get("/crews/:id/posts/:postId/comments", async (c) => {
    const v = await requireUser(c);
    const { cursor } = query(c, crewFeedQuery);
    return c.json(await crewFeedService.comments(v, uuidParam(c, "id"), uuidParam(c, "postId"), cursor));
  })
  .post("/crews/:id/posts/:postId/comments", async (c) => {
    const v = await requireUser(c);
    const { text } = await body(c, crewCommentCreateSchema);
    return c.json(await crewFeedService.comment(v, uuidParam(c, "id"), uuidParam(c, "postId"), text), 201);
  })
  .delete("/crews/:id/comments/:commentId", async (c) => {
    await crewFeedService.removeComment(await requireUser(c), uuidParam(c, "id"), uuidParam(c, "commentId"));
    return c.body(null, 204);
  })
  .put("/crews/:id/posts/:postId/vote", async (c) => {
    const v = await requireUser(c);
    const { optionId } = await body(c, crewPollVoteSchema);
    return c.json(await crewFeedService.vote(v, uuidParam(c, "id"), uuidParam(c, "postId"), optionId));
  })
  .post("/crews/:id/posts/:postId/close", async (c) =>
    c.json(await crewFeedService.close(await requireUser(c), uuidParam(c, "id"), uuidParam(c, "postId"))),
  )
  .get("/crews/:id/photos/:name", async (c) => {
    const v = await requireUser(c);
    const data = await crewFeedService.photo(v, uuidParam(c, "id"), c.req.param("name"));
    return c.body(new Uint8Array(data), 200, {
      "content-type": "image/webp",
      // D36 (tour 2) : jamais gardée en cache, ni partagé ni sur l'appareil (un membre parti perd l'accès).
      "cache-control": "private, no-store",
    });
  })
  // Tour 2 : Réglages › Confidentialité, « Retirer mes publications des crews que j'ai quittés ».
  .delete("/me/crew-content/left-crews", async (c) =>
    c.json(await crewFeedService.withdrawFromLeftCrews(await requireUser(c))),
  )
  // Tour 2 : photo d'une publication signalée, dans le dossier de signalement, pour la modération seulement.
  .get("/admin/reports/:id/crew-photos/:name", async (c) => {
    const v = await requireUser(c);
    const data = await crewPhotoForModeration(v, uuidParam(c, "id"), c.req.param("name"));
    return c.body(new Uint8Array(data), 200, { "content-type": "image/webp", "cache-control": "private, no-store" });
  });
