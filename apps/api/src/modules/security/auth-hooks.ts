// Crochets de Better Auth pour la sécurité du compte (lot 15, corrections des relectures). La double authentification
// est prouvée par la session : ce module pose la preuve (`session.second_factor`), protège l'ajout et le retrait des
// facteurs, envoie les alertes et révoque les autres sessions quand un facteur change.
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware, getSessionFromCtx, isAPIError } from "better-auth/api";

import {
  FACTOR_ENROLLMENT_PATHS,
  FRESH_SESSION_MS,
  isSecondFactor,
  PASSKEY_SIGN_IN_PATH,
  TOTP_VERIFY_PATHS,
  USER_VERIFICATION_REQUIRED_MESSAGE,
  userVerified,
} from "./passkey";
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

export async function securityBefore(ctx: Ctx) {
  // Connexion par clé : la vérification de l'utilisateur (code, Face ID, empreinte) est exigée ; le plugin ne la
  // contrôle pas.
  if (ctx.path === PASSKEY_SIGN_IN_PATH && !userVerified((ctx.body as { response?: unknown } | undefined)?.response)) {
    throw new APIError("UNAUTHORIZED", {
      message: USER_VERIFICATION_REQUIRED_MESSAGE,
      code: USER_VERIFICATION_REQUIRED_MESSAGE,
    });
  }
  // Ajouter, retirer ou changer un facteur : si le compte en a déjà un, la session doit le prouver ; sinon
  // (premier facteur, amorçage), une session récente suffit.
  if (FACTOR_ENROLLMENT_PATHS.includes(ctx.path)) {
    const current = await getSessionFromCtx(ctx).catch(() => null);
    if (current) {
      const proven = isSecondFactor((current.session as { secondFactor?: unknown }).secondFactor);
      const hasFactor = await securityService.accountHasFactor(current.user.id);
      if (hasFactor && !proven) {
        throw new APIError("FORBIDDEN", {
          message:
            "Reconnecte-toi avec ta clé d'accès ou ton code de double authentification pour changer tes facteurs",
          code: "TWO_FACTOR_REQUIRED",
        });
      }
      const created = new Date(current.session.createdAt).getTime();
      if (!hasFactor && Date.now() - created > FRESH_SESSION_MS) {
        throw new APIError("FORBIDDEN", { message: "Reconnecte-toi d'abord", code: "SESSION_NOT_FRESH" });
      }
    }
  }
  // Changement de mot de passe : toujours déconnecter les autres appareils (§ 1.1).
  if (ctx.path === "/change-password" && ctx.body && typeof ctx.body === "object") {
    return { context: { body: { ...ctx.body, revokeOtherSessions: true } } };
  }
}

export async function securityAfter(ctx: Ctx) {
  if (!succeeded(ctx)) return;
  const returned = ctx.context.returned as { user?: { id?: string; twoFactorEnabled?: boolean | null } } | undefined;
  // Alerte « mot de passe changé » (la réinitialisation passe par `onPasswordReset`).
  if (ctx.path === "/change-password") {
    if (returned?.user?.id) await securityService.onPasswordChanged(returned.user.id);
    return;
  }
  // Code TOTP ou code de secours vérifié par une session déjà ouverte : elle prouve désormais le second facteur.
  if (TOTP_VERIFY_PATHS.includes(ctx.path)) {
    const token = await currentToken(ctx);
    if (token) await securityService.markSessionFactor(token, "totp");
    // Première vérification = activation du TOTP (l'utilisateur renvoyé est celui d'avant l'activation).
    const userId = returned?.user?.id;
    if (userId && returned?.user?.twoFactorEnabled === false && (await securityService.totpEnabled(userId))) {
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
