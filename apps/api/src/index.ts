// GlitchTip / Sentry d'abord (lot 15).
import "./instrument";

import { serve } from "@hono/node-server";
import { WebSocketServer } from "ws";

import { app } from "./app";
import { pool } from "./db/client";
import { env } from "./env";
import { startJobs } from "./jobs";
import { signing } from "./lib/signing";

// Clés publiques des QR recopiées dans `signing_keys` (refus de démarrer si une clé diffère de celle en base).
await signing.ensureSynced();
const boss = await startJobs();

const server = serve(
  { fetch: app.fetch, port: env.API_PORT, websocket: { server: new WebSocketServer({ noServer: true }) } },
  (info) => console.log(`API Orasso sur http://localhost:${info.port}/api`),
);

async function shutdown() {
  server.close();
  await boss.stop();
  await pool.end();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
