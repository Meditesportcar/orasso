import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";

import { auth } from "./auth";
import { db } from "./db/client";
import { user } from "./db/schema";
import { env } from "./env";
import { hasSecondFactor } from "./lib/access";
import { AppError, errorResponse, notFound } from "./lib/errors";
import { realtime } from "./lib/realtime";
import { type AppEnv, type AuthUser, loadSession } from "./lib/session";
import { storage } from "./lib/storage";
import { accessRoutes } from "./modules/access/routes";
import { accountRoutes } from "./modules/account/routes";
import { accountQrRoutes } from "./modules/account-qr/routes";
import { adminRoutes } from "./modules/admin/routes";
import { afterEventRoutes } from "./modules/after-event/routes";
import { applicationsRoutes } from "./modules/applications/routes";
import { checkinsRoutes } from "./modules/checkins/routes";
import { communicationRoutes } from "./modules/communication/routes";
import { crewsRoutes } from "./modules/crews/routes";
import { eventsRoutes } from "./modules/events/routes";
import { eventsService } from "./modules/events/service";
import { fieldRoutes } from "./modules/field/routes";
import { invitationsRoutes } from "./modules/invitations/routes";
import { messagingRoutes } from "./modules/messaging/routes";
import { moderationRoutes } from "./modules/moderation/routes";
import { notificationsRoutes } from "./modules/notifications/routes";
import { pointsRoutes } from "./modules/points/routes";
import { profilesRepo } from "./modules/profiles/repo";
import { profilesRoutes } from "./modules/profiles/routes";
import { prosRoutes } from "./modules/pros/routes";
import { providersRoutes } from "./modules/providers/routes";
import { reviewsRoutes } from "./modules/reviews/routes";
import { searchRoutes } from "./modules/search/routes";
import { authGuard, type SessionLike } from "./modules/security/auth-guard";
import { socialRoutes } from "./modules/social/routes";
import { staffRoutes } from "./modules/staff/routes";
import { structuresRoutes } from "./modules/structures/routes";
import { ticketsRoutes } from "./modules/tickets/routes";
import { uploadsRoutes } from "./modules/uploads/routes";
import { garageRoutes } from "./modules/vehicles/garage-routes";
import { vehiclesRoutes } from "./modules/vehicles/routes";
import { weatherRoutes } from "./modules/weather/routes";
import { ws } from "./ws";

export const app = new Hono<AppEnv>().basePath("/api");

// En-têtes de sécurité (recette du lot 12) : nosniff, pas d'encadrement, pas de référent. HSTS est posé par nginx ;
// pas de Cross-Origin-Resource-Policy, pour que les photos restent lisibles par l'appli en recette web (autre origine).
app.use(
  "*",
  secureHeaders({
    xFrameOptions: "DENY",
    strictTransportSecurity: false,
    crossOriginResourcePolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);

// CORS : seulement pour les origines listées dans CORS_ORIGINS (recette de l'appli dans un navigateur).
const corsOrigins =
  env.CORS_ORIGINS?.split(",")
    .map((o) => o.trim())
    .filter(Boolean) ?? [];
if (corsOrigins.length) {
  app.use(
    "*",
    cors({
      origin: corsOrigins,
      allowHeaders: ["authorization", "content-type", "x-device-id"],
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      exposeHeaders: ["set-auth-token"],
      // Recette web de l'appli : cookies de l'étape « code » de la double authentification (lot 15).
      credentials: true,
    }),
  );
}

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

// Corps des requêtes de Better Auth limités à 1 Mo (le garde ci-dessous clone et lit le JSON).
app.use(
  "/auth/*",
  bodyLimit({
    maxSize: 1024 * 1024,
    onError: () => {
      throw new AppError(413, "payload_too_large", "Requête trop lourde");
    },
  }),
);
// Garde unique des routes de Better Auth (session lue en cookie ou en jeton porteur) : `modules/security/auth-guard.ts`.
app.on(
  ["GET", "POST"],
  "/auth/*",
  authGuard((headers) => auth.api.getSession({ headers }) as Promise<SessionLike | null>),
  (c) => auth.handler(c.req.raw),
);

app.route("/ws", ws);

// Fichiers du pilote de stockage « disque » (photos, avatars, logos, affiches : publics par nature).
app.get("/files/*", async (c) => {
  const key = c.req.path.replace(/^\/api\/files\//, "");
  // Justificatifs de vérification des structures (`private/`) : lus par l'administration seulement, jamais ici.
  const data = key && !key.startsWith("private/") ? await storage.get(key) : null;
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
app.route("/", garageRoutes);
app.route("/", structuresRoutes);
app.route("/", providersRoutes);
app.route("/", eventsRoutes);
app.route("/", applicationsRoutes);
app.route("/", notificationsRoutes);
app.route("/", staffRoutes);
app.route("/", checkinsRoutes);
app.route("/", fieldRoutes);
app.route("/", pointsRoutes);
app.route("/", reviewsRoutes);
app.route("/", accountQrRoutes);
app.route("/", prosRoutes);
app.route("/", ticketsRoutes);
app.route("/", adminRoutes);
app.route("/", accountRoutes);
app.route("/", weatherRoutes);
app.route("/", socialRoutes);
app.route("/", uploadsRoutes);
app.route("/", messagingRoutes);
app.route("/", crewsRoutes);
app.route("/", invitationsRoutes);
app.route("/", searchRoutes);
app.route("/", communicationRoutes);
app.route("/", moderationRoutes);
app.route("/", afterEventRoutes);

// Abonnements WebSocket aux canaux d'un événement : mêmes droits que les routes, avec la preuve de second facteur de la
// session qui a ouvert la connexion (sans elle, les organisateurs perdaient le tri en direct depuis le lot 15).
realtime.setAuthorizer(async (userId, channel, ctx) => {
  const u = await db.query.user.findFirst({ where: eq(user.id, userId) });
  const profile = await profilesRepo.byUserId(userId);
  if (!u || !profile) return false;
  const viewer = { user: u as AuthUser, profile, session: { secondFactor: ctx.secondFactor } };
  // Revérification (30 s) d'un super admin : ses droits ne dépendent que du second facteur ; on n'écrit pas une ligne
  // `structure.view_as` du journal d'administration toutes les 30 s (seulement au premier abonnement).
  if (ctx.revalidation && profile.platformRole === "super_admin") {
    return /^event:[0-9a-f-]{36}:(triage|live|access)$/.test(channel) && (env.DEV_SKIP_2FA || hasSecondFactor(viewer));
  }
  return eventsService.canSubscribe(viewer, channel);
});

export type App = typeof app;
