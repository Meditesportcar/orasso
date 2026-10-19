import { Hono } from "hono";

import { type AppEnv, requireUser } from "../../lib/session";
import { uuidParam } from "../../lib/validate";
import { recapService } from "./service";

// Récap (lot 49) : calculé à la demande, pour les pointés et les billets scannés.
export const recapRoutes = new Hono<AppEnv>()
  .get("/me/recaps", async (c) => c.json(await recapService.list(await requireUser(c))))
  .get("/me/recaps/:eventId", async (c) =>
    c.json(await recapService.get(await requireUser(c), uuidParam(c, "eventId"))),
  );
