// Connexion, inscription, déconnexion (Better Auth, jeton bearer), double authentification (lot 15).
// Better Auth garde l'étape « code » dans un cookie signé (`two_factor`) et l'appareil de confiance dans un autre
// (`trust_device`). L'appli les reprend des en-têtes `set-cookie` et les renvoie en `cookie` (téléphone) ; dans un
// navigateur (recette web), c'est le navigateur qui les garde (`credentials: include`).
import type { MainProfile } from "@orasso/shared";

import { request, requestWithHeaders } from "../http";
import { kvDel, kvGet, kvSet } from "../kv";
import { pickCookie } from "./cookies";
import { qs } from "./qs";

const TRUST_KEY = "two-factor-trust";

export type SignInResult = { token: string } | { twoFactor: { cookie: string | null } };

function tokenOf(headers: Headers, body: unknown): string {
  const token = headers.get("set-auth-token") ?? (body as { token?: string } | null)?.token;
  if (!token) throw new Error("Jeton de session absent de la réponse");
  return token;
}

export const authApi = {
  /**
   * Connexion e-mail + mot de passe : jeton dans l'en-tête `set-auth-token`, ou étape « code » si la double
   * authentification est activée (sauf appareil de confiance).
   */
  async signIn(email: string, password: string): Promise<SignInResult> {
    const trust = await kvGet(TRUST_KEY);
    const { data, headers } = await requestWithHeaders<{ twoFactorRedirect?: boolean; token?: string }>(
      "/api/auth/sign-in/email",
      { method: "POST", body: { email, password }, headers: trust ? { cookie: trust } : undefined, cookies: true },
    );
    // Appareil de confiance : le plugin remplace le cookie à chaque usage ; on garde le nouveau.
    const renewed = pickCookie(headers.get("set-cookie"), "trust_device");
    if (renewed) await kvSet(TRUST_KEY, renewed);
    if (data?.twoFactorRedirect) {
      return { twoFactor: { cookie: pickCookie(headers.get("set-cookie"), "two_factor") } };
    }
    return { token: tokenOf(headers, data) };
  },
  /**
   * Deuxième étape : code à 6 chiffres de l'application d'authentification, ou code de secours. `trustDevice` : la
   * prochaine connexion sur cet appareil ne redemandera pas le code (30 jours).
   */
  async verifyTwoFactor(input: {
    code: string;
    backup: boolean;
    trustDevice: boolean;
    cookie: string | null;
  }): Promise<string> {
    const { data, headers } = await requestWithHeaders<{ token?: string }>(
      input.backup ? "/api/auth/two-factor/verify-backup-code" : "/api/auth/two-factor/verify-totp",
      {
        method: "POST",
        body: { code: input.code.replace(/\s+/g, ""), trustDevice: input.trustDevice },
        headers: input.cookie ? { cookie: input.cookie } : undefined,
        cookies: true,
      },
    );
    const trust = pickCookie(headers.get("set-cookie"), "trust_device");
    if (trust) await kvSet(TRUST_KEY, trust);
    return tokenOf(headers, data);
  },
  /**
   * Inscription ordinaire (lot 41) : le pseudo est le champ `name` de Better Auth ; profil choisi, départements (le
   * premier est le favori), prénom et nom (privés) sont obligatoires.
   */
  async signUp(input: {
    email: string;
    password: string;
    pseudo: string;
    mainProfile: MainProfile;
    departments: string[];
    firstName: string;
    lastName: string;
  }): Promise<string> {
    const { data, headers } = await requestWithHeaders("/api/auth/sign-up/email", {
      method: "POST",
      // Lot 36 : la case des conditions générales est cochée (le formulaire ne part pas sans elle) ; l'API la trace.
      body: {
        email: input.email,
        password: input.password,
        name: input.pseudo,
        mainProfile: input.mainProfile,
        departments: input.departments,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        termsAccepted: true,
      },
    });
    return tokenOf(headers, data);
  },
  signOut: () => request<unknown>("/api/auth/sign-out", { method: "POST", body: {} }),
  /** Oublie l'appareil de confiance (déconnexion complète). */
  forgetTrustedDevice: () => kvDel(TRUST_KEY),
  pseudoAvailable: (pseudo: string) =>
    request<{ valid: boolean; available: boolean }>(`/api/pseudo-available${qs({ pseudo })}`),
};
