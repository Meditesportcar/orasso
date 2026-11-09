import { presenceInputSchema } from "@orasso/shared";
import { Hono } from "hono";

import { type AppEnv, requireUser } from "../../lib/session";
import { body, uuidParam } from "../../lib/validate";
import { presenceService } from "./service";

// Le direct (lot R7d1) : « Je suis sur place » (présence par GPS) et la statistique des présents de l'organisateur.
// `private, no-store` : jamais en cache, la réponse est propre à la personne.
export const presenceRoutes = new Hono<AppEnv>()
  .post("/events/:id/presence", async (c) => {
    const v = await requireUser(c);
    const input = await body(c, presenceInputSchema);
    return c.json(await presenceService.validate(v, uuidParam(c, "id"), input), 200, { "cache-control": "no-store" });
  })
  .get("/events/:id/presences/summary", async (c) =>
    c.json(await presenceService.summary(await requireUser(c), uuidParam(c, "id")), 200, {
      "cache-control": "private, no-store",
    }),
  );
