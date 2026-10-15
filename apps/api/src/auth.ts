import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins/two-factor";

import { db } from "./db/client";
import * as schema from "./db/schema";
import { env } from "./env";
import { ensureProfile } from "./modules/profiles/service";

// Google et Apple sont prévus (docs/01) mais restent désactivés tant que leurs identifiants n'existent pas.
const socialProviders = {
  ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? { google: { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET } }
    : {}),
  ...(env.APPLE_CLIENT_ID && env.APPLE_CLIENT_SECRET
    ? { apple: { clientId: env.APPLE_CLIENT_ID, clientSecret: env.APPLE_CLIENT_SECRET } }
    : {}),
};

export const auth = betterAuth({
  appName: "Orasso",
  baseURL: env.PUBLIC_URL,
  basePath: "/api/auth",
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true },
  socialProviders,
  // L'obligation (organisateurs, administration) est appliquée par l'API métier : `lib/access.ts`.
  plugins: [twoFactor()],
  // Chaque compte a son profil métier dès l'inscription ; le pseudo vient du champ `name` de l'inscription.
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await ensureProfile(user);
        },
      },
    },
  },
  trustedOrigins: [env.PUBLIC_URL],
  telemetry: { enabled: false },
});

export type Auth = typeof auth;
