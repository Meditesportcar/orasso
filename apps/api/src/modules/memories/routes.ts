import { Hono } from "hono";

import { rateLimit } from "../../lib/rateLimit";
import { type AppEnv, requireUser } from "../../lib/session";
import { uuidParam } from "../../lib/validate";
import { memoriesService } from "./service";

// Les souvenirs (lot R7j) : propres à la personne connectée, jamais lus pour une autre.
export const memoriesRoutes = new Hono<AppEnv>()
  .get("/me/memories/today", async (c) => {
    const v = await requireUser(c);
    rateLimit("feedRead", v.user.id);
    return c.json(await memoriesService.todayFor(v.user.id));
  })
  .get("/me/memories/:eventId", async (c) => {
    const v = await requireUser(c);
    rateLimit("feedRead", v.user.id);
    return c.json(await memoriesService.detail(v.user.id, uuidParam(c, "eventId")));
  });
