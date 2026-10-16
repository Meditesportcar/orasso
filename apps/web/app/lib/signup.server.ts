// Création de compte par e-mail (Better Auth), commune à `/inscription` et `/invitation/:jeton`.
import { pseudoSchema } from "@orasso/shared";

import { api, cookieFrom } from "./api.server";

export type SignupErrors = { pseudo?: string; email?: string; password?: string; form?: string };

export type SignupResult =
  | { ok: true; headers: Headers; cookie: string }
  | { ok: false; errors: SignupErrors; status: number; values: { pseudo: string; email: string } };

/** Lit pseudo, e-mail et mot de passe du formulaire, valide, crée le compte. Les cookies de session sont à renvoyer. */
export async function signUpFromForm(request: Request, form: FormData): Promise<SignupResult> {
  const pseudo = String(form.get("pseudo") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const errors: SignupErrors = {};

  const parsed = pseudoSchema.safeParse(pseudo);
  if (!parsed.success) errors.pseudo = parsed.error.issues[0]?.message;
  else {
    const free = await api<{ available: boolean }>(request, `/pseudo-available?pseudo=${encodeURIComponent(pseudo)}`);
    if (free.ok && !free.data.available) errors.pseudo = "Ce pseudo est déjà pris.";
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) errors.email = "Cette adresse e-mail n'est pas valide.";
  if (password.length < 8) errors.password = "8 caractères au moins.";
  const values = { pseudo, email };
  if (Object.keys(errors).length) return { ok: false, errors, status: 400, values };

  const res = await api(request, "/auth/sign-up/email", { method: "POST", json: { email, password, name: pseudo } });
  if (!res.ok) {
    const message = String(res.error.message ?? "");
    const taken = res.status === 422 || /exist|already/i.test(message);
    errors[taken ? "email" : "form"] = taken
      ? "Un compte existe déjà avec cette adresse."
      : "Inscription impossible pour le moment.";
    return { ok: false, errors, status: res.status === 422 ? 409 : 400, values };
  }
  return { ok: true, headers: res.headers, cookie: cookieFrom(res.headers) };
}
