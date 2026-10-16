import { searchQuerySchema } from "@orasso/shared";
import { Hono } from "hono";

import { limitSearch } from "../../lib/search-limit";
import { type AppEnv, optionalUser } from "../../lib/session";
import { query } from "../../lib/validate";
import { searchService } from "./service";

export const searchRoutes = new Hono<AppEnv>()
  // Recherche de premier niveau : événements et pros sans compte, le reste pour les connectés. Limitée par personne
  // (par adresse pour un visiteur) : un texte de 2 caractères au moins, 10 résultats par groupe au plus, sans curseur.
  .get("/search", async (c) => {
    const viewer = await optionalUser(c);
    limitSearch(c, viewer);
    const result = await searchService.run(viewer, query(c, searchQuerySchema));
    return c.json(result, 200, { "cache-control": "private, no-cache" });
  });
