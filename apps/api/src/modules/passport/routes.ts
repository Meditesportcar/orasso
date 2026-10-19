import { passportQuerySchema } from "@orasso/shared";
import { Hono } from "hono";

import { type AppEnv, requireUser } from "../../lib/session";
import { query } from "../../lib/validate";
import { passportService } from "./service";

// Passeport (lot 49) : les tampons de la personne connectée, par saison.
export const passportRoutes = new Hono<AppEnv>().get("/me/passport", async (c) => {
  const v = await requireUser(c);
  const { season } = query(c, passportQuerySchema);
  return c.json(await passportService.mine(v, season));
});
