import { citySearchQuery, weatherAtInput, weatherPlacesInput } from "@orasso/shared";
import { Hono } from "hono";

import { env } from "../../env";
import { requirePlatformRole } from "../../lib/access";
import { notFound } from "../../lib/errors";
import { searchCities } from "../../lib/geocode";
import { rateLimit } from "../../lib/rateLimit";
import { type AppEnv, requireUser } from "../../lib/session";
import { body, query, uuidParam } from "../../lib/validate";
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
  })
  // Lot R8m : « Ma météo », les lieux (choisis, sinon la préfecture du département). Le cache des cases de 0,1° suffit : un
  // seul appel au fournisseur par case et par 3 h, quel que soit le nombre de comptes.
  .get("/me/weather/places", async (c) => {
    const v = await requireUser(c);
    rateLimit("myWeather", v.user.id);
    c.header("cache-control", "private, no-store");
    return c.json(await weatherService.places(v));
  })
  .put("/me/weather/places", async (c) => {
    const v = await requireUser(c);
    rateLimit("myWeather", v.user.id);
    const input = await body(c, weatherPlacesInput);
    return c.json(await weatherService.savePlaces(v, input.places));
  })
  // Lot R8m : « Utiliser ma position ». POST, position en corps de requête (une adresse finit dans les journaux d'accès) ;
  // rien n'est écrit, rien n'est rattaché au compte, rien n'est mis en cache autre que la case de 0,1°.
  .post("/weather/at", async (c) => {
    const v = await requireUser(c);
    rateLimit("myWeather", v.user.id);
    const position = await body(c, weatherAtInput);
    c.header("cache-control", "private, no-store");
    return c.json(await weatherService.at(position));
  })
  // Lot R8m : chercher une commune pour « Changer de lieu » (communes seulement, huit au plus).
  .get("/geo/cities", async (c) => {
    const v = await requireUser(c);
    rateLimit("myWeather", v.user.id);
    const { q } = query(c, citySearchQuery);
    c.header("cache-control", "private, no-store");
    return c.json({ cities: await searchCities(q) });
  });
