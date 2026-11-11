import { Hono } from "hono";

import { env } from "../../env";
import { requirePlatformRole } from "../../lib/access";
import { notFound } from "../../lib/errors";
import { type AppEnv, requireUser } from "../../lib/session";
import { uuidParam } from "../../lib/validate";
import { weatherService } from "./service";

// Correctif cache et session (11/11) : monté avant `loadSession` (app.ts). Même réponse pour tout le monde (aucun lecteur
// dans le service), donc cache public permis et aucun `Set-Cookie` possible.
export const weatherPublicRoutes = new Hono<AppEnv>()
  // Public : `null` au-delà de 7 jours avant l'événement, après sa fin ou sans prévision. Cache d'une heure.
  .get("/events/by-slug/:slug/weather", async (c) => {
    const weather = await weatherService.forEvent(c.req.param("slug"));
    c.header("cache-control", "public, max-age=3600");
    return c.json(weather);
  });

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
  .get("/me/weather", async (c) => {
    const user = await requireUser(c);
    // Lot R8r : `?place=1` = la météo du département seule (relecture de l'Accueil au premier chargement), jamais mise en cache.
    if (c.req.query("place") === "1") {
      c.header("cache-control", "private, no-store");
      return c.json(await weatherService.mineAtHome(user));
    }
    const weather = await weatherService.mine(user);
    c.header("cache-control", "private, max-age=600");
    return c.json(weather);
  });
