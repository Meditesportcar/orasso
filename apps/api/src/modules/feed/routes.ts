// Routes du Fil (lot R7e1). Toutes exigent une session : le Fil et ses publications ne sont jamais servis à un visiteur.
import {
  attachableEventsQuery,
  feedCardKinds,
  feedLessSchema,
  feedMineQuery,
  feedPostCreateSchema,
  feedPostPatchSchema,
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
    // Lot R7i, tour 3 : le fil porte des cartes de rendez-vous au spot (lieu) : jamais gardé.
    c.header("cache-control", "private, no-store");
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
  // Vague R8 : les événements où cette casquette peut se rattacher, avec le rôle déduit (jamais choisi).
  .get("/me/feed-posts/attachable-events", async (c) => {
    const v = await requireUser(c);
    return c.json(await feedPostsService.attachable(v, query(c, attachableEventsQuery)));
  })
  // Vérifier un envoi dont la réponse s'est perdue : la publication de cet auteur (toutes casquettes) ou 404.
  .get("/me/feed-posts/by-client/:clientId", async (c) => {
    const v = await requireUser(c);
    c.header("cache-control", "private, no-store");
    return c.json(await feedPostsService.byClient(v, uuidParam(c, "clientId")));
  })
  .patch("/me/feed-posts/:id", async (c) => {
    const v = await requireUser(c);
    return c.json(await feedPostsService.patch(v, uuidParam(c, "id"), await body(c, feedPostPatchSchema)));
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
  .get("/feed-posts/:id/photos/:name", async (c) => {
    const v = await requireUser(c);
    const photo = await feedPostsService.photo(
      v,
      uuidParam(c, "id"),
      c.req.param("name"),
      c.req.header("if-none-match"),
    );
    // Jamais gardée sans revalidation (un abonné qui part, un compte qui passe en privé, une publication retirée) ;
    // `ETag` : le navigateur redemande à chaque affichage et reçoit un 304 léger tant que l'accès tient.
    const headers = {
      "cache-control": "private, no-cache",
      etag: photo.etag,
      vary: "Cookie, Authorization",
    };
    if (photo.status === 304) return c.body(null, 304, headers);
    return c.body(new Uint8Array(photo.data), 200, { ...headers, "content-type": "image/webp" });
  })
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
