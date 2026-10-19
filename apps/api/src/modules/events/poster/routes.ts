// Générateur d'affiche (lot 47) : aperçu en direct, génération, téléchargement de la Story.
import { posterPreviewSchema, posterSettingsSchema } from "@orasso/shared";
import { Hono } from "hono";

import { rateLimit } from "../../../lib/rateLimit";
import { type AppEnv, requireUser } from "../../../lib/session";
import { body, uuidParam } from "../../../lib/validate";
import { eventsService } from "../service";
import { posterService } from "./service";

export const posterRoutes = new Hono<AppEnv>()
  // Aperçu (assistant, débounce 300 ms côté client) : PNG de 540 px au plus, rien n'est écrit.
  .post("/posters/preview", async (c) => {
    const v = await requireUser(c);
    rateLimit("posterPreview", v.user.id);
    const png = await posterService.preview(v, await body(c, posterPreviewSchema));
    return c.body(new Uint8Array(png), 200, { "content-type": "image/png", "cache-control": "private, no-store" });
  })
  .post("/events/:id/poster/generate", async (c) => {
    const v = await requireUser(c);
    rateLimit("fileUpload", v.user.id);
    return c.json(await eventsService.generatePoster(v, uuidParam(c, "id"), await body(c, posterSettingsSchema)));
  })
  // Story 9:16 à poster sur Instagram : l'organisateur la télécharge (pas de publication automatique).
  .get("/events/:id/poster/story", async (c) => {
    const { data, filename } = await eventsService.posterStory(await requireUser(c), uuidParam(c, "id"));
    return c.body(new Uint8Array(data), 200, {
      "content-type": "image/png",
      "cache-control": "private, no-store",
      "content-disposition": `attachment; filename="${filename}"`,
    });
  });
