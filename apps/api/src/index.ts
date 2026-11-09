// GlitchTip / Sentry d'abord (lot 15).
import "./instrument";

import { serve } from "@hono/node-server";
import { STORY_VIDEO_UPLOAD_TIMEOUT_MS } from "@orasso/shared";
import { WebSocketServer } from "ws";

import { app } from "./app";
import { pool } from "./db/client";
import { env } from "./env";
import { startJobs } from "./jobs";
import { installDevClock } from "./lib/dev-clock";
import { signing } from "./lib/signing";

// Clés publiques des QR recopiées dans `signing_keys` (refus de démarrer si une clé diffère de celle en base).
await signing.ensureSynced();
// Horloge simulée (lot 34a) : seulement avec DEV_CLOCK=on (refusée en production par env.ts), décalage lu en base.
if (await installDevClock()) console.log("Horloge simulée active (DEV_CLOCK=on).");
const boss = await startJobs();

const server = serve(
  {
    fetch: app.fetch,
    port: env.API_PORT,
    websocket: {
      server: new WebSocketServer({
        noServer: true,
        maxPayload: 4096,
        // Jamais le sous-protocole qui porte le jeton (« orasso.bearer.… ») dans la réponse : seulement « orasso.v1 ».
        handleProtocols: (protocols) => (protocols.has("orasso.v1") ? "orasso.v1" : false),
      }),
    },
  },
  (info) => console.log(`API Orasso sur http://localhost:${info.port}/api`),
);

// Lot R7g (tour 3) : délai d'un envoi vidéo (60 Mo en 4G), le même que l'appli, le site et Nginx (10 min). Fixé exprès : la valeur
// par défaut de Node a changé d'une version à l'autre, et un envoi lent ne doit pas tenir un socket plus longtemps que ça.
if ("requestTimeout" in server) server.requestTimeout = STORY_VIDEO_UPLOAD_TIMEOUT_MS;

async function shutdown() {
  server.close();
  await boss.stop();
  await pool.end();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
