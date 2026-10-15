import { reviewCreateSchema, reviewReplySchema } from "@orasso/shared";
import { Hono } from "hono";

import { type AppEnv, optionalUser, requireUser } from "../../lib/session";
import { body, uuidParam } from "../../lib/validate";
import { reviewsService } from "./service";

export const reviewsRoutes = new Hono<AppEnv>()
  .post("/applications/:id/review", async (c) => {
    const v = await requireUser(c);
    const input = await body(c, reviewCreateSchema);
    return c.json(await reviewsService.create(v, uuidParam(c, "id"), input), 201);
  })
  .get("/events/by-slug/:slug/reviews", async (c) =>
    c.json(await reviewsService.listPublic(c.req.param("slug"), await optionalUser(c))),
  )
  .get("/events/:id/reviews", async (c) =>
    c.json(await reviewsService.listForOrganizer(await requireUser(c), uuidParam(c, "id"))),
  )
  .put("/reviews/:id/reply", async (c) => {
    const v = await requireUser(c);
    const { reply } = await body(c, reviewReplySchema);
    return c.json(await reviewsService.reply(v, uuidParam(c, "id"), reply));
  });
