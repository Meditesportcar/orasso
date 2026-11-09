// Routes du Fil (lot R7e1). Toutes exigent une session : le Fil et ses publications ne sont jamais servis à un visiteur.
import {
  feedCardKinds,
  feedLessSchema,
  feedMineQuery,
  feedPostCreateSchema,
  feedQuery,
  feedReportSchema,
} from "@orasso/shared";
import { Hono } from "hono";

import { validation } from "../../lib/errors";
import { type AppEnv, requireUser } from "../../lib/session";
import { body, query, uuidParam } from "../../lib/validate";
import { feedPostsService } from "./publish";
import { feedService } from "./service";

export const feedRoutes = new Hono<AppEnv>()
  // `GET /fil?filter=for_you|nearby|following&cursor=` → `{ items: Card[], nextCursor, filter }`
  .get("/fil", async (c) => {
    const v = await requireUser(c);
    return c.json(await feedService.feed(v, query(c, feedQuery)));
  })
  .get("/me/fil/less", async (c) => c.json(feedService.lessKinds(await requireUser(c))))
  .post("/me/feed/less", async (c) => {
    const v = await requireUser(c);
    const { kind } = await body(c, feedLessSchema);
    return c.json(await feedService.addLess(v, kind));
  })
  .delete("/me/feed/less/:kind", async (c) => {
    const v = await requireUser(c);
    const kind = c.req.param("kind");
    const known = feedCardKinds.find((k) => k === kind);
    if (!known) throw validation("Genre de carte inconnu");
    return c.json(await feedService.removeLess(v, known));
  })
  .post("/me/feed-posts", async (c) => {
    const v = await requireUser(c);
    return c.json(await feedPostsService.create(v, await body(c, feedPostCreateSchema)), 201);
  })
  .get("/me/feed-posts", async (c) => {
    const v = await requireUser(c);
    return c.json(await feedPostsService.mine(v, query(c, feedMineQuery).cursor));
  })
  .delete("/me/feed-posts/:id", async (c) => {
    await feedPostsService.remove(await requireUser(c), uuidParam(c, "id"));
    return c.body(null, 204);
  })
  .get("/feed-posts/:id", async (c) => c.json(await feedPostsService.get(await requireUser(c), uuidParam(c, "id"))))
  .put("/feed-posts/:id/reaction", async (c) =>
    c.json(await feedPostsService.react(await requireUser(c), uuidParam(c, "id"), true)),
  )
  .delete("/feed-posts/:id/reaction", async (c) =>
    c.json(await feedPostsService.react(await requireUser(c), uuidParam(c, "id"), false)),
  )
  .post("/feed-posts/:id/report", async (c) => {
    const v = await requireUser(c);
    const input = await body(c, feedReportSchema);
    return c.json(await feedPostsService.report(v, uuidParam(c, "id"), input), 201);
  });
