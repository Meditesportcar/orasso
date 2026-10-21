import { Hono } from "hono";

import { env } from "../../env";
import { requirePlatformRole } from "../../lib/access";
import { notFound } from "../../lib/errors";
import { type AppEnv, requireUser } from "../../lib/session";
import { uuidParam } from "../../lib/validate";
import { weatherService } from "./service";

// Météo (lot 28). Lecture du cache en base uniquement : aucune de ces routes n'appelle un fournisseur pour un
// utilisateur (sauf le cache d'un département à `GET /me/weather`, regroupé et limité à un appel par 3 h).
export const weatherRoutes = new Hono<AppEnv>()
  // Recette locale : passage explicite de la tâche, sans attendre le planificateur.
  .post("/dev/weather/:eventId/refresh", async (c) => {
    if (env.NODE_ENV === "production" || !env.METEO_URL || env.WEATHER_PROVIDER !== "open-meteo") {
      throw notFound("Route inconnue");
    }
    await requirePlatformRole(await requireUser(c), "super_admin");
    return c.json(await weatherService.refresh(uuidParam(c, "eventId")));
  })
  // Public : `null` au-delà de 7 jours avant l'événement, après sa fin ou sans prévision. Cache d'une heure.
  .get("/events/by-slug/:slug/weather", async (c) => {
    const weather = await weatherService.forEvent(c.req.param("slug"));
    c.header("cache-control", "public, max-age=3600");
    return c.json(weather);
  })
  .get("/me/weather", async (c) => {
    const weather = await weatherService.mine(await requireUser(c));
    c.header("cache-control", "private, max-age=600");
    return c.json(weather);
  });
