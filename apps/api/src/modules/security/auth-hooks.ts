// Crochets de Better Auth pour la sécurité du compte (lot 15, corrections des relectures). La double authentification
// est prouvée par la session : ce module pose la preuve (`session.second_factor`), protège l'ajout et le retrait des
// facteurs, envoie les alertes et révoque les autres sessions quand un facteur change.
import { signUpRequiredSchema } from "@orasso/shared";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";
import { eq } from "drizzle-orm";

import { db } from "../../db/client";
import { profiles } from "../../db/schema";
import { now } from "../../lib/deps";

import { PASSKEY_SIGN_IN_PATH, TOTP_VERIFY_PATHS, USER_VERIFICATION_REQUIRED_MESSAGE, userVerified } from "./passkey";
import { securityService } from "./service";

type Ctx = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

const succeeded = (ctx: Ctx) => {
  const returned = ctx.context.returned;
  return Boolean(returned) && !isAPIError(returned) && !(returned instanceof Response);
};

/** Jeton de la session qui reste ouverte après l'appel (nouvelle session si l'appel l'a recréée). */
async function currentToken(ctx: Ctx): Promise<string | null> {
  const fresh = (ctx.context as { newSession?: { session?: { token?: string } } | null }).newSession;
  if (fresh?.session?.token) return fresh.session.token;
  const returned = ctx.context.returned as { token?: unknown } | undefined;
  if (typeof returned?.token === "string") return returned.token;
  const session = await getSessionFromCtx(ctx).catch(() => null);
  return session?.session.token ?? null;
}

/**
 * Le garde des facteurs n'est **pas** ici : un crochet « before » de Better Auth voit la requête avant la conversion du
 * jeton porteur et ne connaît donc pas la session d'une requête `Authorization: Bearer`. Il est dans le middleware Hono
 * `auth-guard.ts`, devant le handler. Ici : double défense sur la vérification de l'utilisateur d'une clé (sans session)
 * et révocation des autres sessions au changement de mot de passe.
 */
export async function securityBefore(ctx: Ctx) {
  if (ctx.path === PASSKEY_SIGN_IN_PATH && !userVerified((ctx.body as { response?: unknown } | undefined)?.response)) {
    throw new APIError("UNAUTHORIZED", {
      message: USER_VERIFICATION_REQUIRED_MESSAGE,
      code: USER_VERIFICATION_REQUIRED_MESSAGE,
    });
  }
  // Changement de mot de passe : toujours déconnecter les autres appareils (§ 1.1).
  if (ctx.path === "/change-password" && ctx.body && typeof ctx.body === "object") {
    return { context: { body: { ...ctx.body, revokeOtherSessions: true } } };
  }
}

export async function securityAfter(ctx: Ctx) {
  if (!succeeded(ctx)) return;
  const returned = ctx.context.returned as { user?: { id?: string; twoFactorEnabled?: boolean | null } } | undefined;
  // Lot 36 : inscription par e-mail, conditions générales acceptées (case obligatoire, contrôlée par la route) : tracé.
  // Lot 41 : profil choisi, départements (le premier est le favori), prénom et nom (privés) posés sur le profil ; la
  // route a déjà validé le corps (`signUpRequiredSchema`).
  if (ctx.path === "/sign-up/email") {
    const parsed = signUpRequiredSchema.safeParse(ctx.body ?? {});
    if (parsed.success && returned?.user?.id) {
      await db
        .update(profiles)
        .set({
          termsAcceptedAt: now(),
          mainProfile: parsed.data.mainProfile,
          departments: [...new Set(parsed.data.departments)],
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
        })
        .where(eq(profiles.userId, returned.user.id));
    }
    return;
  }
  // Alerte « mot de passe changé » (la réinitialisation passe par `onPasswordReset`).
  if (ctx.path === "/change-password") {
    if (returned?.user?.id) await securityService.onPasswordChanged(returned.user.id);
    return;
  }
  // Code TOTP ou code de secours vérifié par une session déjà ouverte : elle prouve désormais le second facteur.
  if (TOTP_VERIFY_PATHS.includes(ctx.path)) {
    const token = await currentToken(ctx);
    const userId = returned?.user?.id;
    // Preuve posée seulement si le TOTP est effectivement actif après l'appel (défense : un code de secours d'une
    // activation non confirmée ne prouve rien).
    const active = userId ? await securityService.totpEnabled(userId) : false;
    if (token && active) await securityService.markSessionFactor(token, "totp");
    // Première vérification = activation du TOTP (l'utilisateur renvoyé est celui d'avant l'activation).
    if (userId && returned?.user?.twoFactorEnabled === false && active) {
      await securityService.onFactorChanged(userId, "security_two_factor_enabled", token);
    }
    return;
  }
  if (
    ctx.path === "/two-factor/disable" ||
    ctx.path === "/passkey/verify-registration" ||
    ctx.path === "/passkey/delete-passkey"
  ) {
    const fromMiddleware = (ctx.context as { session?: { user?: { id?: string } } | null }).session?.user?.id;
    const userId = fromMiddleware ?? (await getSessionFromCtx(ctx).catch(() => null))?.user.id;
    if (!userId) return;
    const type =
      ctx.path === "/two-factor/disable"
        ? "security_two_factor_disabled"
        : ctx.path === "/passkey/verify-registration"
          ? "security_passkey_added"
          : "security_passkey_removed";
    await securityService.onFactorChanged(userId, type, await currentToken(ctx));
  }
}

/**
 * Appareil de confiance (cookie du plugin TOTP) : la connexion par mot de passe d'un compte TOTP actif n'est gardée
 * par le plugin que si l'appareil a déjà donné le code ; la session porte alors la preuve `totp`. Doit être déclaré
 * **après** `twoFactor()` (les crochets des plugins s'exécutent dans l'ordre).
 */
export const trustedDeviceFactor = {
  id: "orasso-trusted-device",
  hooks: {
    after: [
      {
        matcher: (context: { path?: string }) => context.path === "/sign-in/email",
        handler: createAuthMiddleware(async (ctx) => {
          const kept = (
            ctx.context as {
              newSession?: { session: { token: string }; user: { twoFactorEnabled?: boolean | null } } | null;
            }
          ).newSession;
          if (kept?.user.twoFactorEnabled) await securityService.markSessionFactor(kept.session.token, "totp");
        }),
      },
    ],
  },
} satisfies BetterAuthPlugin;
