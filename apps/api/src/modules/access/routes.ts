import { Hono } from "hono";

import { type AppEnv, requireUser } from "../../lib/session";
import { signing } from "../../lib/signing";
import { uuidParam } from "../../lib/validate";
import { accessService } from "./service";

// Correctif cache et session (11/11) : monté avant `loadSession` (app.ts). Même contenu pour tout le monde, donc cache
// public permis ; aucune lecture de session, donc aucun `Set-Cookie` dans une réponse que le cache public pourrait garder.
export const accessPublicRoutes = new Hono<AppEnv>()
  // Clés publiques de vérification des QR d'inscription (appli du staff, scripts hors ligne).
  .get("/keys", async (c) => {
    c.header("cache-control", "public, max-age=3600");
    return c.json({ keys: await signing.publicKeys() });
  });

export const accessRoutes = new Hono<AppEnv>().get("/applications/:id/pass", async (c) =>
  c.json(await accessService.mine(await requireUser(c), uuidParam(c, "id"))),
);
