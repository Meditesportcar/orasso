import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

import { auth } from "../auth";
import { type Profile, profilesRepo } from "../modules/profiles/repo";
import { ensureProfile } from "../modules/profiles/service";
import { unauthenticated } from "./errors";

export type AuthUser = typeof auth.$Infer.Session.user;

export type AppEnv = {
  Variables: {
    user: AuthUser | null;
    profile: Profile | null;
    /** En-tête `X-Device-Id` de l'appli (attribution des scans, lot 06). */
    deviceId: string | null;
  };
};

/** Charge la session Better Auth (cookie) et le profil, sans rien exiger. */
export const loadSession = createMiddleware<AppEnv>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("user", session?.user ?? null);
  c.set("profile", session ? ((await profilesRepo.byUserId(session.user.id)) ?? null) : null);
  c.set("deviceId", c.req.header("x-device-id") ?? null);
  await next();
});

export type Viewer = { user: AuthUser; profile: Profile };

/** Utilisateur connecté (401 sinon). Le profil est créé s'il manque (compte antérieur au lot 05). */
export async function requireUser(c: Context<AppEnv>): Promise<Viewer> {
  const user = c.get("user");
  if (!user) throw unauthenticated();
  let profile = c.get("profile");
  if (!profile) {
    profile = await ensureProfile(user);
    c.set("profile", profile);
  }
  return { user, profile };
}

/** Utilisateur connecté ou rien (routes publiques enrichies quand on est connecté). */
export async function optionalUser(c: Context<AppEnv>): Promise<Viewer | null> {
  return c.get("user") ? requireUser(c) : null;
}
