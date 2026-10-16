// Garde unique des routes `/api/auth/*` (lot 15, relecture finale) : un middleware Hono **devant** le handler de
// Better Auth. La session y est résolue par `auth.api.getSession({ headers })`, qui lit le cookie **et** le jeton
// porteur (`Authorization: Bearer`) — les crochets « before » de Better Auth, eux, voient la requête avant la conversion
// du jeton par le plugin `bearer` et ne peuvent pas servir de garde. Chaque route exposée par better-auth 1.7.9 avec nos
// plugins est classée ci-dessous (audit : `ARCHITECTURE.md`, « Sécurité du compte ») ; une route non classée est
// refusée et un test échoue.
import type { Context, MiddlewareHandler } from "hono";

import { rateLimit } from "../../lib/rateLimit";
import { FRESH_SESSION_MS, isSecondFactor, USER_VERIFICATION_REQUIRED_MESSAGE, userVerified } from "./passkey";
import { securityService } from "./service";

export type AuthRouteClass =
  /** Sans session ou pour ouvrir une session (inscription, connexion, réinitialisation, vérification d'e-mail…). */
  | "public"
  /** Session ordinaire, sans effet sur les facteurs (lire ou fermer ses sessions, renommer une clé…). */
  | "session"
  /** Ajoute, retire ou révèle un facteur ou un secret : preuve d'un facteur existant exigée (amorçage sinon). */
  | "factor"
  /** Vérifie un code TOTP : étape de connexion (sans session) ou activation / confirmation (avec session). */
  | "totp-verify"
  /** Inutile pour Orasso et risquée : refusée. */
  | "refused";

/** Classement des 45 routes HTTP de better-auth 1.7.9 avec `twoFactor`, `bearer`, `passkey` (chemins sans `/api/auth`). */
export const AUTH_ROUTES: Record<string, AuthRouteClass> = {
  "/sign-up/email": "public",
  "/sign-in/email": "public",
  "/sign-in/social": "public", // Google / Apple inactifs tant que leurs identifiants manquent
  "/callback/:id": "public",
  "/sign-out": "public",
  "/get-session": "public",
  "/verify-email": "public",
  "/send-verification-email": "public",
  "/request-password-reset": "public",
  "/reset-password": "public",
  "/reset-password/:token": "public",
  "/passkey/generate-authenticate-options": "public",
  "/passkey/verify-authentication": "public", // vérification de l'utilisateur exigée (ci-dessous)
  "/error": "public",
  "/ok": "public",
  "/delete-user/callback": "public", // sans effet : `deleteUser` n'est pas activé
  "/change-password": "session", // autres sessions révoquées, preuve reportée (crochets)
  "/revoke-session": "session",
  "/revoke-sessions": "session",
  "/revoke-other-sessions": "session",
  "/passkey/list-user-passkeys": "session",
  "/passkey/update-passkey": "session", // renommer seulement
  "/passkey/generate-register-options": "factor",
  "/passkey/verify-registration": "factor",
  "/passkey/delete-passkey": "factor",
  "/two-factor/enable": "factor",
  "/two-factor/disable": "factor",
  "/two-factor/get-totp-uri": "factor", // révèle le secret TOTP
  "/two-factor/generate-backup-codes": "factor", // nouveaux codes de secours
  "/two-factor/verify-totp": "totp-verify",
  "/two-factor/verify-backup-code": "totp-verify",
  "/two-factor/send-otp": "refused", // OTP par e-mail non configuré
  "/two-factor/verify-otp": "refused",
  "/update-session": "refused", // la preuve ne se pose pas par l'utilisateur
  "/list-sessions": "refused", // `/api/me/sessions` à la place (sans les jetons)
  "/update-user": "refused", // profil : `/api/me/profile`
  "/change-email": "refused", // non prévu ; changerait l'identifiant du compte
  "/delete-user": "refused", // suppression : `DELETE /api/me`
  "/verify-password": "refused", // oracle de mot de passe inutile
  "/link-social": "refused",
  "/unlink-account": "refused",
  "/list-accounts": "refused",
  "/account-info": "refused",
  "/get-access-token": "refused",
  "/refresh-token": "refused",
};

const json = (c: Context, status: 401 | 403 | 404 | 429, code: string, message: string) =>
  c.json({ code, message }, status);

/** Chemin Better Auth d'une URL (`/api/auth/reset-password/abc` → `/reset-password/:token`). */
export function authRouteOf(pathname: string): string | null {
  // Fermé par défaut : aucune normalisation (barre finale, majuscules, `//`, `%2F` → route inconnue, donc 404).
  const path = pathname.replace(/^\/api\/auth/, "");
  if (AUTH_ROUTES[path]) return path;
  if (/^\/reset-password\/[^/]+$/.test(path)) return "/reset-password/:token";
  if (/^\/callback\/[^/]+$/.test(path)) return "/callback/:id";
  return null;
}

async function bodyOf(c: Context): Promise<Record<string, unknown> | null> {
  if (c.req.method === "GET") return null;
  try {
    return (await c.req.raw.clone().json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Garde : à monter juste avant `auth.handler` sur `/api/auth/*`. */
export function authGuard(getSession: (headers: Headers) => Promise<SessionLike | null>): MiddlewareHandler {
  return async (c, next) => {
    const route = authRouteOf(c.req.path);
    const kind = route ? AUTH_ROUTES[route] : undefined;
    if (!route || !kind || kind === "refused") {
      return json(c, 404, "ROUTE_NOT_AVAILABLE", "Route indisponible");
    }
    if (route === "/passkey/verify-authentication") {
      const body = await bodyOf(c);
      if (!userVerified(body?.response)) {
        return json(c, 401, USER_VERIFICATION_REQUIRED_MESSAGE, USER_VERIFICATION_REQUIRED_MESSAGE);
      }
    }
    if (kind === "public" || kind === "session") return next();

    const current = await getSession(c.req.raw.headers);
    // Sans session : la route elle-même répond (401, ou étape « code » de la connexion pour `totp-verify`).
    if (!current) return next();
    const userId = current.user.id;

    if (kind === "totp-verify") {
      // Session déjà ouverte qui vérifie un code : pas de compteur côté plugin → limite applicative.
      try {
        rateLimit("twoFactorVerify", userId);
      } catch {
        return json(c, 429, "TOO_MANY_REQUESTS", "Trop d'essais : réessaie dans un quart d'heure.");
      }
      const pending = await securityService.totpPendingActivation(userId);
      // Une activation se confirme par un code TOTP, jamais par un code de secours : le plugin ne vérifie pas que la
      // ligne est confirmée et n'active rien sur cette route.
      if (pending && route === "/two-factor/verify-backup-code") {
        return json(c, 403, "TWO_FACTOR_REQUIRED", "Confirme l'activation avec le code de ton application.");
      }
      // Confirmation d'une activation (ligne TOTP encore non vérifiée) : même règle qu'un ajout de facteur.
      if (!pending) return next();
    }

    if (route === "/passkey/verify-registration") {
      const body = await bodyOf(c);
      if (body?.createSession) return json(c, 403, "FORBIDDEN", "Création de session refusée");
    }

    const proven = isSecondFactor(current.session.secondFactor);
    const hasFactor = await securityService.accountHasFactor(userId);
    if (hasFactor && !proven) {
      return json(
        c,
        403,
        "TWO_FACTOR_REQUIRED",
        "Reconnecte-toi avec ta clé d'accès ou ton code de double authentification pour changer tes facteurs",
      );
    }
    if (!hasFactor && Date.now() - new Date(current.session.createdAt).getTime() > FRESH_SESSION_MS) {
      return json(c, 403, "SESSION_NOT_FRESH", "Reconnecte-toi d'abord");
    }
    return next();
  };
}

export type SessionLike = {
  user: { id: string };
  session: { createdAt: Date | string; secondFactor?: unknown };
};
