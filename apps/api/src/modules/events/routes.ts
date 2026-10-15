import {
  eventCreateSchema,
  eventListQuerySchema,
  eventUpdateSchema,
  outlookUpdateSchema,
  zoneCreateSchema,
  zoneUpdateSchema,
} from "@orasso/shared";
import { Hono } from "hono";

import { type AppEnv, optionalUser, requireUser } from "../../lib/session";
import { body, query, uuidParam } from "../../lib/validate";
import { eventsService } from "./service";

export const eventsRoutes = new Hono<AppEnv>()
  // Public.
  .get("/events", async (c) => c.json(await eventsService.list(query(c, eventListQuerySchema))))
  .get("/events/by-slug/:slug", async (c) =>
    c.json(await eventsService.getPublic(c.req.param("slug"), await optionalUser(c))),
  )
  // Organisateur.
  .get("/structures/:id/events", async (c) =>
    c.json(await eventsService.listForStructure(await requireUser(c), uuidParam(c, "id"))),
  )
  .post("/structures/:id/events", async (c) => {
    const v = await requireUser(c);
    return c.json(await eventsService.create(v, uuidParam(c, "id"), await body(c, eventCreateSchema)), 201);
  })
  .get("/events/:id", async (c) =>
    c.json(await eventsService.getForOrganizer(await requireUser(c), uuidParam(c, "id"))),
  )
  .patch("/events/:id", async (c) => {
    const v = await requireUser(c);
    return c.json(await eventsService.update(v, uuidParam(c, "id"), await body(c, eventUpdateSchema)));
  })
  .post("/events/:id/publish", async (c) =>
    c.json(await eventsService.publish(await requireUser(c), uuidParam(c, "id"))),
  )
  .post("/events/:id/cancel", async (c) => c.json(await eventsService.cancel(await requireUser(c), uuidParam(c, "id"))))
  .patch("/events/:id/outlook", async (c) => {
    const v = await requireUser(c);
    const { outlook } = await body(c, outlookUpdateSchema);
    return c.json(await eventsService.setOutlook(v, uuidParam(c, "id"), outlook));
  })
  .get("/events/:id/zones", async (c) => c.json(await eventsService.zones(await requireUser(c), uuidParam(c, "id"))))
  .post("/events/:id/zones", async (c) => {
    const v = await requireUser(c);
    return c.json(await eventsService.addZone(v, uuidParam(c, "id"), await body(c, zoneCreateSchema)), 201);
  })
  .patch("/events/:id/zones/:zoneId", async (c) => {
    const v = await requireUser(c);
    const input = await body(c, zoneUpdateSchema);
    return c.json(await eventsService.updateZone(v, uuidParam(c, "id"), uuidParam(c, "zoneId"), input));
  })
  .delete("/events/:id/zones/:zoneId", async (c) => {
    await eventsService.removeZone(await requireUser(c), uuidParam(c, "id"), uuidParam(c, "zoneId"));
    return c.body(null, 204);
  });
