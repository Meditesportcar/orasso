import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { bearer } from "better-auth/plugins/bearer";
import { twoFactor } from "better-auth/plugins/two-factor";
import { eq } from "drizzle-orm";

import { db } from "./db/client";
import * as schema from "./db/schema";
import { env } from "./env";
import { accountService } from "./modules/account/service";
import { ensureProfile } from "./modules/profiles/service";
import { securityAfter, securityBefore, trustedDeviceFactor } from "./modules/security/auth-hooks";
import { secondFactorForPath } from "./modules/security/passkey";
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
    // Après `twoFactor()` : marque `totp` la session gardée grâce au cookie « appareil de confiance ».
    trustedDeviceFactor,
  ],
  // Second facteur prouvé par la session (lot 15, corrections) : colonne `session.second_factor`.
  session: {
    additionalFields: { secondFactor: { type: "string", required: false, input: false } },
  },
  // Second facteur des sessions, ajout et retrait des facteurs, alertes : `modules/security/auth-hooks.ts`.
  hooks: {
    before: createAuthMiddleware(securityBefore),
    after: createAuthMiddleware(securityAfter),
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
        // Preuve du second facteur posée par le chemin qui crée la session (clé, code TOTP), ou reportée de la session
        // courante quand Better Auth la recrée (changement de mot de passe, activation ou désactivation du TOTP).
        before: async (session, ctx) => {
          // Lot 32 : compte banni de la plateforme, connexion refusée (site, appli, clé d'accès, Google / Apple).
          const [banned] = await db
            .select({ at: schema.profiles.bannedAt })
            .from(schema.profiles)
            .where(eq(schema.profiles.userId, session.userId));
          if (banned?.at) {
            throw new APIError("FORBIDDEN", { message: "Ce compte a été banni d'Orasso.", code: "BANNED" });
          }
          const current = (ctx?.context as { session?: { session?: { secondFactor?: unknown } } | null } | undefined)
            ?.session?.session?.secondFactor;
          const secondFactor = secondFactorForPath(ctx?.path, current);
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
  // L'appli envoie l'origine de son API (`EXPO_PUBLIC_API_URL`) sur `/api/auth/*` : en ligne, même hôte que
  // `PUBLIC_URL` ; en développement, l'API locale, plus les adresses ajoutées à `CORS_ORIGINS` (téléphone sur le Wi-Fi).
  // En production, seule l'adresse publique est de confiance.
  trustedOrigins: [
    env.PUBLIC_URL,
    ...(env.NODE_ENV === "production" ? [] : [...corsOrigins, `http://localhost:${env.API_PORT}`]),
  ],
  telemetry: { enabled: false },
});

export type Auth = typeof auth;
