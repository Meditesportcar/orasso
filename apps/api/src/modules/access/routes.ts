import { Hono } from "hono";

import { type AppEnv, requireUser } from "../../lib/session";
import { signing } from "../../lib/signing";
import { uuidParam } from "../../lib/validate";
import { accessService } from "./service";

export const accessRoutes = new Hono<AppEnv>()
  // Clés publiques de vérification des QR d'inscription (appli du staff, scripts hors ligne).
  .get("/keys", async (c) => {
    c.header("cache-control", "public, max-age=3600");
    return c.json({ keys: await signing.publicKeys() });
  })
  .get("/applications/:id/pass", async (c) =>
    c.json(await accessService.mine(await requireUser(c), uuidParam(c, "id"))),
  );
