import { incidentCreateSchema, incidentPhotoSchema, staffAlertCreateSchema } from "@orasso/shared";
import { Hono } from "hono";

import { type AppEnv, requireUser } from "../../lib/session";
import { body, uuidParam } from "../../lib/validate";
import { fieldService } from "./service";

export const fieldRoutes = new Hono<AppEnv>()
  .post("/events/:id/alerts", async (c) => {
    const v = await requireUser(c);
    return c.json(await fieldService.alert(v, uuidParam(c, "id"), await body(c, staffAlertCreateSchema)), 201);
  })
  .get("/events/:id/alerts", async (c) => {
    c.header("cache-control", "private, no-store");
    return c.json(await fieldService.alerts(await requireUser(c), uuidParam(c, "id")));
  })
  .post("/events/:id/alerts/:alertId/resolve", async (c) =>
    c.json(await fieldService.resolveAlert(await requireUser(c), uuidParam(c, "id"), uuidParam(c, "alertId"))),
  )
  .post("/events/:id/incidents", async (c) => {
    const v = await requireUser(c);
    return c.json(await fieldService.addIncident(v, uuidParam(c, "id"), await body(c, incidentCreateSchema)), 201);
  })
  .get("/events/:id/incidents", async (c) =>
    c.json(await fieldService.incidents(await requireUser(c), uuidParam(c, "id"))),
  )
  // Photo envoyée après coup : `incidentId` = identifiant de l'incident ou `clientId` généré par l'appli.
  .patch("/events/:id/incidents/:incidentId", async (c) => {
    const v = await requireUser(c);
    const { photoKey } = await body(c, incidentPhotoSchema);
    return c.json(await fieldService.setIncidentPhoto(v, uuidParam(c, "id"), uuidParam(c, "incidentId"), photoKey));
  })
  .get("/events/:id/incidents/:incidentId/photo", async (c) => {
    const data = await fieldService.incidentPhoto(
      await requireUser(c),
      uuidParam(c, "id"),
      uuidParam(c, "incidentId"),
    );
    return c.body(new Uint8Array(data), 200, { "content-type": "image/webp", "cache-control": "private, no-store" });
  });
