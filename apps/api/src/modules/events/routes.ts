import {
  eventCreateSchema,
  eventDaysPutSchema,
  eventListQuerySchema,
  eventUpdateSchema,
  outlookUpdateSchema,
  recurrenceCreateSchema,
  zoneCreateSchema,
  zoneUpdateSchema,
} from "@orasso/shared";
import { Hono } from "hono";

import { validation } from "../../lib/errors";
import { geocode } from "../../lib/geocode";
import { rateLimit } from "../../lib/rateLimit";
import { limitSearch } from "../../lib/search-limit";
import { type AppEnv, optionalUser, requireUser } from "../../lib/session";
import { body, query, uuidParam } from "../../lib/validate";
import { eventsService } from "./service";

export const eventsRoutes = new Hono<AppEnv>()
  // Public.
  // Liste de l'Explorer : connecté, elle sait trier par affinités et par distance (lot 29) ; la réponse dépend alors de la personne.
  .get("/events", async (c) => {
    const viewer = await optionalUser(c);
    const q = query(c, eventListQuerySchema);
    if (q.q) limitSearch(c, viewer);
    return c.json(await eventsService.list(q, viewer), 200, { "cache-control": "private, no-cache" });
  })
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
  // Lot 26 : jours d'un événement sur plusieurs jours (liste complète).
  .put("/events/:id/days", async (c) => {
    const v = await requireUser(c);
    return c.json(await eventsService.setDays(v, uuidParam(c, "id"), await body(c, eventDaysPutSchema)));
  })
  .post("/events/:id/duplicate", async (c) =>
    c.json(await eventsService.duplicate(await requireUser(c), uuidParam(c, "id")), 201),
  )
  .post("/events/:id/recurrence", async (c) => {
    const v = await requireUser(c);
    const { rule } = await body(c, recurrenceCreateSchema);
    return c.json(await eventsService.createRecurrence(v, uuidParam(c, "id"), rule), 201);
  })
  .post("/events/:id/poster", async (c) => {
    const v = await requireUser(c);
    const form = await c.req.parseBody();
    if (!(form.poster instanceof File)) throw validation("Champ « poster » attendu (fichier)");
    return c.json(await eventsService.setPoster(v, uuidParam(c, "id"), form.poster));
  })
  // Recherche d'adresse de l'assistant (service public de l'IGN) : renvoie la meilleure correspondance, ou null.
  .get("/geocode", async (c) => {
    const v = await requireUser(c);
    rateLimit("geocode", v.user.id);
    const q = (c.req.query("q") ?? "").trim();
    if (q.length < 3 || q.length > 200) throw validation("Adresse trop courte");
    return c.json({ match: await geocode(q) });
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
