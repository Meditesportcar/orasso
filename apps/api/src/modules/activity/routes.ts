import { activityQuery, requestsQuery, structureActivityQuery } from "@orasso/shared";
import { Hono } from "hono";

import { type AppEnv, requireUser } from "../../lib/session";
import { query, uuidParam } from "../../lib/validate";
import { requestsService } from "./requests";
import { activityService } from "./service";
import { structureActivityService } from "./structure";

// Lot R7c1 : la cloche (Activité) et les Demandes. `POST /me/notifications/read` (module notifications) marque des
// lignes lues ; ici on ne lit que ce qui me concerne, et on ne sert que des listes blanches.
export const activityRoutes = new Hono<AppEnv>()
  .get("/me/activity", async (c) => {
    const v = await requireUser(c);
    c.header("cache-control", "private, no-store");
    return c.json(await activityService.list(v, query(c, activityQuery).cursor));
  })
  .get("/me/activity/count", async (c) => {
    const v = await requireUser(c);
    c.header("cache-control", "private, no-store");
    return c.json({ unseen: await activityService.unseenCount(v.user.id) });
  })
  .post("/me/activity/seen", async (c) => {
    const v = await requireUser(c);
    await activityService.markSeen(v.user.id);
    return c.body(null, 204);
  })
  .get("/me/requests", async (c) => {
    const v = await requireUser(c);
    c.header("cache-control", "private, no-store");
    return c.json(await requestsService.list(v, query(c, requestsQuery).cursor));
  })
  // Lot R9d : l'Activité de la structure (cloche de la casquette organisateur). Adressée par `/structures/:id`, comme la
  // Boîte : l'en-tête acteur n'est pas lu. `POST /me/notifications/read { ids }` marque mes lignes lues.
  .get("/structures/:id/activity", async (c) => {
    const v = await requireUser(c);
    c.header("cache-control", "private, no-store");
    return c.json(await structureActivityService.list(v, uuidParam(c, "id"), query(c, structureActivityQuery)));
  })
  .get("/structures/:id/activity/count", async (c) => {
    const v = await requireUser(c);
    c.header("cache-control", "private, no-store");
    return c.json(await structureActivityService.count(v, uuidParam(c, "id")));
  })
  .post("/structures/:id/activity/seen", async (c) => {
    const v = await requireUser(c);
    await structureActivityService.markSeen(v, uuidParam(c, "id"));
    return c.body(null, 204);
  })
  .get("/structures/:id/requests", async (c) => {
    const v = await requireUser(c);
    c.header("cache-control", "private, no-store");
    return c.json(await structureActivityService.requests(v, uuidParam(c, "id")));
  });
