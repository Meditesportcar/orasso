import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";
import { bearer } from "better-auth/plugins/bearer";
import { twoFactor } from "better-auth/plugins/two-factor";

import { db } from "./db/client";
import * as schema from "./db/schema";
import { env } from "./env";
import { accountService } from "./modules/account/service";
import { ensureProfile } from "./modules/profiles/service";
import {
  PASSKEY_FRESH_SESSION_MS,
  PASSKEY_SIGN_IN_PATH,
  secondFactorForPath,
  userVerified,
} from "./modules/security/passkey";
import { securityService } from "./modules/security/service";

// Google et Apple sont prévus (docs/01) mais restent désactivés tant que leurs identifiants n'existent pas.
const socialProviders = {
  ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
    : {}),
  ...(env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET
    ? { apple: { clientId: env.APPLE_CLIENT_ID, clientSecret: env.APPLE_CLIENT_SECRET } }
    : {}),
};

const corsOrigins =
  env.CORS_ORIGINS?.split(",")
    .map((o) => o.trim())
    .filter(Boolean) ?? [];

const publicUrl = new URL(env.PUBLIC_URL);

export const auth = betterAuth({
  appName: "Orasso",
  baseURL: env.PUBLIC_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  // Lot 15 (ARCHITECTURE-SUITE § 1.1) : réinitialisation par e-mail, sessions révoquées ; vérification de l'e-mail
  // demandée à l'inscription mais non bloquante (S1).
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    resetPasswordTokenExpiresIn: 3600,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, token }) => {
      await accountService.sendPasswordReset(
        user,
        `${env.PUBLIC_URL}/reinitialisation?token=${encodeURIComponent(token)}`,
      );
    },
    onPasswordReset: async ({ user }) => {
      await securityService.onPasswordChanged(user.id);
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    // Pas de session ouverte par le lien (elle contournerait la double authentification) : on se connecte ensuite.
    autoSignInAfterVerification: false,
    expiresIn: 3600,
    sendVerificationEmail: async ({ user, token }) => {
      await accountService.sendEmailVerification(
        user,
        `${env.PUBLIC_URL}/verification-email?token=${encodeURIComponent(token)}`,
      );
    },
    // Parrainage (§ 1.3) : le filleul qui confirme son adresse rapporte +10 à son parrain.
    afterEmailVerification: async (user) => {
      await accountService.onEmailVerified(user.id);
    },
  },
  socialProviders,
  // L'obligation (organisateurs, administration) est appliquée par l'API métier : `lib/access.ts`.
  // `bearer` : l'appli mobile garde le jeton de session dans le trousseau sécurisé et l'envoie en `Authorization`
  // (en-tête `set-auth-token` à la connexion), sans cookie.
  // `passkey` (lot 15, S2) : clés d'accès WebAuthn créées et utilisées sur le site ; une session ouverte par une clé
  // vaut double authentification (`lib/access.ts`).
  plugins: [
    twoFactor(),
    bearer(),
    passkey({
      rpID: publicUrl.hostname,
      rpName: "Orasso",
      origin: publicUrl.origin,
      // Une clé sans vérification de l'utilisateur (code, Face ID, empreinte) ne vaut pas double authentification.
      authenticatorSelection: { userVerification: "required" },
    }),
  ],
  // Second facteur prouvé par la session (lot 15, corrections) : colonne `session.second_factor`.
  session: {
    additionalFields: { secondFactor: { type: "string", required: false, input: false } },
  },
  hooks: {
    // Changement de mot de passe : toujours déconnecter les autres appareils (§ 1.1).
    before: createAuthMiddleware(async (ctx) => {
      // Connexion par clé : la vérification de l'utilisateur est exigée (le plugin ne la contrôle pas).
      if (
        ctx.path === PASSKEY_SIGN_IN_PATH &&
        !userVerified((ctx.body as { response?: unknown } | undefined)?.response)
      ) {
        throw new APIError("UNAUTHORIZED", { message: "Vérification de l'utilisateur exigée" });
      }
      // Supprimer une clé : session récente seulement.
      if (ctx.path === "/passkey/delete-passkey") {
        const current = await getSessionFromCtx(ctx);
        const created = current?.session.createdAt ? new Date(current.session.createdAt).getTime() : 0;
        if (Date.now() - created > PASSKEY_FRESH_SESSION_MS) {
          throw new APIError("FORBIDDEN", { message: "Reconnecte-toi pour supprimer une clé" });
        }
      }
      if (ctx.path === "/change-password" && ctx.body && typeof ctx.body === "object") {
        return { context: { body: { ...ctx.body, revokeOtherSessions: true } } };
      }
    }),
    // Alerte « mot de passe changé » (la réinitialisation passe par `onPasswordReset`).
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/change-password") return;
      const returned = ctx.context.returned;
      if (!returned || isAPIError(returned) || returned instanceof Response) return;
      const userId = (returned as { user?: { id?: string } }).user?.id;
      if (userId) await securityService.onPasswordChanged(userId);
    }),
  },
  // Chaque compte a son profil métier dès l'inscription ; le pseudo vient du champ `name` de l'inscription.
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await ensureProfile(user);
        },
      },
    },
    session: {
      create: {
        before: async (session, ctx) => {
          const secondFactor = secondFactorForPath(ctx?.path);
          return { data: { ...session, secondFactor } };
        },
        // Alerte « nouvelle connexion » (empreinte d'appareil inconnue), jamais bloquante.
        after: async (session) => {
          try {
            await securityService.onLogin(session.userId, session.ipAddress, session.userAgent);
          } catch (error) {
            console.error("Alerte de connexion :", error);
          }
        },
      },
    },
  },
  trustedOrigins: [env.PUBLIC_URL, ...corsOrigins],
  telemetry: { enabled: false },
});

export type Auth = typeof auth;
