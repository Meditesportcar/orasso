import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import { auth } from "./auth";
import { db } from "./db/client";
import { AppError, errorResponse, notFound } from "./lib/errors";
import { type AppEnv, loadSession } from "./lib/session";
import { storage } from "./lib/storage";
import { profilesRoutes } from "./modules/profiles/routes";
import { vehiclesRoutes } from "./modules/vehicles/routes";
import { ws } from "./ws";

export const app = new Hono<AppEnv>().basePath("/api");

app.onError(errorResponse);
app.notFound((c) => errorResponse(notFound("Route inconnue"), c));

app.get("/health", async (c) => {
  try {
    await db.execute(sql`select 1`);
    return c.json({ status: "ok", database: "ok" });
  } catch {
    return c.json({ status: "error", database: "unreachable" }, 503);
  }
});

app.on(["GET", "POST"], "/auth/*", (c) => auth.handler(c.req.raw));

app.route("/ws", ws);

// Fichiers du pilote de stockage « disque » (photos, avatars, logos, affiches : publics par nature).
app.get("/files/*", async (c) => {
  const key = c.req.path.replace(/^\/api\/files\//, "");
  const data = key ? await storage.get(key) : null;
  if (!data) throw notFound("Fichier introuvable");
  return c.body(new Uint8Array(data), 200, {
    "content-type": key.endsWith(".webp") ? "image/webp" : "application/octet-stream",
    "cache-control": "public, max-age=31536000, immutable",
  });
});

// Envois de fichiers : 16 Mo au plus par requête (photos de 15 Mo).
app.use(
  "*",
  bodyLimit({
    maxSize: 16 * 1024 * 1024,
    onError: () => {
      throw new AppError(413, "payload_too_large", "Requête trop lourde");
    },
  }),
);
app.use("*", loadSession);

app.route("/", profilesRoutes);
app.route("/", vehiclesRoutes);

export type App = typeof app;
