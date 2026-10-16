// Connexion, inscription, déconnexion (Better Auth, jeton bearer).
import { request, requestWithHeaders } from "../http";
import { qs } from "./qs";

export const authApi = {
  /** Connexion e-mail + mot de passe : le jeton de session revient dans l'en-tête `set-auth-token`. */
  async signIn(email: string, password: string): Promise<string> {
    const { headers } = await requestWithHeaders("/api/auth/sign-in/email", {
      method: "POST",
      body: { email, password },
    });
    const token = headers.get("set-auth-token");
    if (!token) throw new Error("Jeton de session absent de la réponse");
    return token;
  },
  /** Inscription : le pseudo est le champ `name` de Better Auth. */
  async signUp(email: string, password: string, pseudo: string): Promise<string> {
    const { headers } = await requestWithHeaders("/api/auth/sign-up/email", {
      method: "POST",
      body: { email, password, name: pseudo },
    });
    const token = headers.get("set-auth-token");
    if (!token) throw new Error("Jeton de session absent de la réponse");
    return token;
  },
  signOut: () => request<unknown>("/api/auth/sign-out", { method: "POST", body: {} }),
  pseudoAvailable: (pseudo: string) =>
    request<{ valid: boolean; available: boolean }>(`/api/pseudo-available${qs({ pseudo })}`),
};
