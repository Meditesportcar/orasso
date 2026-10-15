import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

import { auth } from "./auth";
import { db } from "./db/client";
import { user } from "./db/schema";
import { AppError, errorResponse, notFound } from "./lib/errors";
import { realtime } from "./lib/realtime";
import { type AppEnv, type AuthUser, loadSession } from "./lib/session";
import { storage } from "./lib/storage";
import { accessRoutes } from "./modules/access/routes";
import { adminRoutes } from "./modules/admin/routes";
import { applicationsRoutes } from "./modules/applications/routes";
import { eventsRoutes } from "./modules/events/routes";
import { eventsService } from "./modules/events/service";
import { notificationsRoutes } from "./modules/notifications/routes";
import { profilesRepo } from "./modules/profiles/repo";
import { profilesRoutes } from "./modules/profiles/routes";
import { structuresRoutes } from "./modules/structures/routes";
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

app.route("/", accessRoutes);
app.route("/", profilesRoutes);
app.route("/", vehiclesRoutes);
app.route("/", structuresRoutes);
app.route("/", eventsRoutes);
app.route("/", applicationsRoutes);
app.route("/", notificationsRoutes);
app.route("/", adminRoutes);

// Abonnements WebSocket aux canaux d'un événement : mêmes droits que les routes.
realtime.setAuthorizer(async (userId, channel) => {
  const u = await db.query.user.findFirst({ where: eq(user.id, userId) });
  const profile = await profilesRepo.byUserId(userId);
  if (!u || !profile) return false;
  return eventsService.canSubscribe({ user: u as AuthUser, profile }, channel);
});

export type App = typeof app;
