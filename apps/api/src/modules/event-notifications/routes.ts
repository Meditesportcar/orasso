import { eventNotificationPrefsSchema } from "@orasso/shared";
import { Hono } from "hono";

import { rateLimit } from "../../lib/rateLimit";
import { type AppEnv, requireUser } from "../../lib/session";
import { body, uuidParam } from "../../lib/validate";
import { eventNotificationsService } from "./service";

// Notifications d'un événement (lot R8n1) : mes Nouveautés pour cet événement, et le nombre de personnes prévenues d'un
// changement (organisateurs). Réponses à liste blanche : `{ news, hasPlace }` et `{ recipients }`.
export const eventNotificationsRoutes = new Hono<AppEnv>()
  .get("/me/events/:id/notification-prefs", async (c) => {
    const v = await requireUser(c);
    rateLimit("feedRead", v.user.id);
    return c.json(await eventNotificationsService.get(v.user.id, uuidParam(c, "id")));
  })
  .put("/me/events/:id/notification-prefs", async (c) => {
    const v = await requireUser(c);
    rateLimit("feedRead", v.user.id);
    const { news } = await body(c, eventNotificationPrefsSchema);
    return c.json(await eventNotificationsService.set(v.user.id, uuidParam(c, "id"), news));
  })
  .get("/events/:id/notify-preview", async (c) => {
    const v = await requireUser(c);
    rateLimit("feedRead", v.user.id);
    return c.json(await eventNotificationsService.preview(v, uuidParam(c, "id")));
  });
