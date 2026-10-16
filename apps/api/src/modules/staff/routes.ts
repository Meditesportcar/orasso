import { eventStaffUpdateSchema, presenceSchema, staffSyncQuerySchema } from "@orasso/shared";
import { Hono } from "hono";

import { validation } from "../../lib/errors";
import { type AppEnv, requireUser } from "../../lib/session";
import { body, query, uuidParam } from "../../lib/validate";
import { staffRemindService } from "./remind";
import { staffService } from "./service";

const userIdParam = (raw: string | undefined) => {
  const id = raw ?? "";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw validation("userId invalide");
  return id;
};

export const staffRoutes = new Hono<AppEnv>()
  .get("/me/staff-events", async (c) => c.json(await staffService.myEvents(await requireUser(c))))
  .get("/events/:id/staff", async (c) => c.json(await staffService.list(await requireUser(c), uuidParam(c, "id"))))
  .patch("/events/:id/staff/:userId", async (c) => {
    const v = await requireUser(c);
    const input = await body(c, eventStaffUpdateSchema);
    return c.json(await staffService.update(v, uuidParam(c, "id"), userIdParam(c.req.param("userId")), input));
  })
  // Relance à la demande d'un membre qui n'a pas répondu (casquette Organisateur de l'appli, lot 22).
  .post("/events/:id/staff/:userId/remind", async (c) => {
    const v = await requireUser(c);
    return c.json(await staffRemindService.remind(v, uuidParam(c, "id"), userIdParam(c.req.param("userId"))));
  })
  .put("/events/:id/staff/me/presence", async (c) => {
    const v = await requireUser(c);
    const { present } = await body(c, presenceSchema);
    return c.json(await staffService.setPresence(v, uuidParam(c, "id"), present));
  })
  .get("/events/:id/staff/sync", async (c) => {
    const v = await requireUser(c);
    const { since } = query(c, staffSyncQuerySchema);
    return c.json(await staffService.sync(v, uuidParam(c, "id"), since));
  });
