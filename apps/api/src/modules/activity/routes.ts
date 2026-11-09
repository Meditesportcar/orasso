import { activityQuery, requestsQuery } from "@orasso/shared";
import { Hono } from "hono";

import { type AppEnv, requireUser } from "../../lib/session";
import { query } from "../../lib/validate";
import { requestsService } from "./requests";
import { activityService } from "./service";

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
  });
