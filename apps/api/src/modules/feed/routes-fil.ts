// Routes du Fil ajoutées par le lot R8c1 : cartes vues (`POST /me/fil/seen`) et nouveautés (`GET /fil/fresh`). `GET /fil`
// reste dans `routes.ts` (il appelle `feedService.feed`). Toutes exigent une session ; aucune ne rend les cartes vues d'un
// autre : `seen` ne répond rien (204) et `fresh` ne rend qu'un nombre, calculé pour la personne qui demande.
import { feedFreshQuery, feedSeenSchema } from "@orasso/shared";
import { Hono } from "hono";

import { type AppEnv, requireUser } from "../../lib/session";
import { body, query } from "../../lib/validate";
import { feedSeenService } from "./seen";
import { feedService } from "./service";

export const feedFilRoutes = new Hono<AppEnv>()
  // `POST /me/fil/seen { cards: [{ id, action: "view" | "open" | "share", at? }] }` → 204 (50 cartes au plus, jamais « sponsored »).
  .post("/me/fil/seen", async (c) => {
    const v = await requireUser(c);
    await feedSeenService.record(v, await body(c, feedSeenSchema));
    return c.body(null, 204);
  })
  // `GET /fil/fresh?filter=&since=` → `{ count }` (20 au plus) : la pastille « Nouvelles publications ».
  .get("/fil/fresh", async (c) => {
    const v = await requireUser(c);
    c.header("cache-control", "private, no-store");
    return c.json(await feedService.fresh(v, query(c, feedFreshQuery)));
  });
