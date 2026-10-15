import { pageQuery } from "@orasso/shared";
import { Hono } from "hono";
import { z } from "zod";

import { type AppEnv, requireUser } from "../../lib/session";
import { body, query } from "../../lib/validate";
import { notificationsService } from "./service";

const readSchema = z.object({ ids: z.array(z.uuid()).max(500).optional(), all: z.literal(true).optional() });

export const notificationsRoutes = new Hono<AppEnv>()
  .get("/me/notifications", async (c) => {
    const v = await requireUser(c);
    const q = query(c, pageQuery);
    return c.json(await notificationsService.list(v.user.id, q.limit, q.cursor));
  })
  .post("/me/notifications/read", async (c) => {
    const v = await requireUser(c);
    const input = await body(c, readSchema);
    await notificationsService.markRead(v.user.id, input.all ? "all" : (input.ids ?? []));
    return c.body(null, 204);
  });
