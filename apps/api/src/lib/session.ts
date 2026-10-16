import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

import { auth } from "../auth";
import { type Profile, profilesRepo } from "../modules/profiles/repo";
import { ensureProfile } from "../modules/profiles/service";
import { now } from "./deps";
import { AppError, unauthenticated } from "./errors";

export type AuthUser = typeof auth.$Infer.Session.user;

export type AppEnv = {
  Variables: {
    user: AuthUser | null;
    profile: Profile | null;
    /** Session Better Auth de la requête (liste des sessions : « cet appareil »). */
    sessionId: string | null;
    /** Second facteur prouvé par la session (« passkey »), lot 15. */
    sessionSecondFactor: string | null;
    /** En-tête `X-Device-Id` de l'appli (attribution des scans, lot 06). */
    deviceId: string | null;
  };
};

/** Charge la session Better Auth (cookie) et le profil, sans rien exiger. */
export const loadSession = createMiddleware<AppEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", session?.user ?? null);
  c.set("sessionId", session?.session.id ?? null);
  c.set(
    "sessionSecondFactor",
    (session?.session as { secondFactor?: string | null } | undefined)?.secondFactor ?? null,
  );
  c.set("profile", session ? ((await profilesRepo.byUserId(session.user.id)) ?? null) : null);
  c.set("deviceId", c.req.header("x-device-id") ?? null);
  await next();
});

/** `session` : second facteur prouvé par la session de la requête (absent hors requête HTTP : tâches, scripts). */
export type Viewer = { user: AuthUser; profile: Profile; session?: { secondFactor: string | null } };

/**
 * Écritures permises à un compte suspendu (ARCHITECTURE-SUITE § 0.4, lot 32) : contester, supprimer son compte, et ce
 * qui accompagne la lecture ou la sécurité du compte (marquer lu le Journal ou une conversation, appareils pour recevoir
 * les notifications, fermer une session). Les routes `/auth/*` ne passent pas par ici.
 */
const WRITES_WHILE_SUSPENDED: [method: string, path: RegExp][] = [
  ["POST", /^\/api\/sanctions\/[^/]+\/contest$/],
  ["DELETE", /^\/api\/me$/],
  ["POST", /^\/api\/me\/notifications\/read$/],
  ["POST", /^\/api\/conversations\/[^/]+\/read$/],
  ["POST", /^\/api\/me\/devices$/],
  ["DELETE", /^\/api\/me\/devices\/[^/]+$/],
  ["DELETE", /^\/api\/me\/sessions\/[^/]+$/],
];

function writeAllowedWhileSuspended(c: Context<AppEnv>): boolean {
  const method = c.req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;
  return WRITES_WHILE_SUSPENDED.some(([m, re]) => m === method && re.test(c.req.path));
}

/**
 * Utilisateur connecté (401 sinon). Le profil est créé s'il manque (compte antérieur au lot 05). Compte suspendu
 * (`suspended_until` dans le futur, lot 32) : lecture seule, toute autre écriture répond `403 suspended`.
 */
export async function requireUser(c: Context<AppEnv>): Promise<Viewer> {
  const user = c.get("user");
  if (!user) throw unauthenticated();
  let profile = c.get("profile");
  if (!profile) {
    profile = await ensureProfile(user);
    c.set("profile", profile);
  }
  // Compte supprimé (anonymisé) : plus aucun accès, même si une session avait survécu.
  if (profile.deletedAt) throw unauthenticated();
  if (profile.suspendedUntil && profile.suspendedUntil > now() && !writeAllowedWhileSuspended(c)) {
    throw new AppError(403, "suspended", "Ton compte est suspendu : lecture seule.");
  }
  return { user, profile, session: { secondFactor: c.get("sessionSecondFactor") ?? null } };
}

/** Utilisateur connecté ou rien (routes publiques enrichies quand on est connecté). */
export async function optionalUser(c: Context<AppEnv>): Promise<Viewer | null> {
  return c.get("user") ? requireUser(c) : null;
}
