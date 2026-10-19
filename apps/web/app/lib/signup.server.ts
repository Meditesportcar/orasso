// Création de compte par e-mail (Better Auth), commune à `/inscription` et `/invitation/:jeton`.
import {
  arriveeLabels,
  departmentSchema,
  expressLabels,
  type MainProfile,
  mainProfiles,
  PASSWORD_MIN_LENGTH,
  passwordHint,
  pseudoSchema,
} from "@orasso/shared";

import { api, cookieFrom, withCookies } from "./api.server";
import { applyInviteAfterSignup } from "./invite.server";

export type SignupErrors = {
  pseudo?: string;
  email?: string;
  password?: string;
  terms?: string;
  form?: string;
  /** Lot 41 : profil choisi, départements, prénom et nom obligatoires. */
  mainProfile?: string;
  departments?: string;
  firstName?: string;
  lastName?: string;
};

/** Ce que le formulaire redonne à l'écran après une erreur (jamais le mot de passe). */
export type SignupValues = {
  pseudo: string;
  email: string;
  mainProfile: string;
  departments: string[];
  firstName: string;
  lastName: string;
};

export type SignupResult =
  | { ok: true; headers: Headers; cookie: string }
  | { ok: false; errors: SignupErrors; status: number; values: SignupValues };

/** Lit pseudo, e-mail, mot de passe, profil, départements, prénom et nom du formulaire, valide, crée le compte. Les cookies de session sont à renvoyer. */
export async function signUpFromForm(request: Request, form: FormData): Promise<SignupResult> {
  const pseudo = String(form.get("pseudo") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  const mainProfile = String(form.get("mainProfile") ?? "");
  const departments = [...new Set(form.getAll("department").map((d) => String(d)))].filter(
    (d) => departmentSchema.safeParse(d).success,
  );
  const firstName = String(form.get("firstName") ?? "").trim();
  const lastName = String(form.get("lastName") ?? "").trim();
  const errors: SignupErrors = {};

  const parsed = pseudoSchema.safeParse(pseudo);
  if (!parsed.success) errors.pseudo = parsed.error.issues[0]?.message;
  else {
    const free = await api<{ available: boolean }>(request, `/pseudo-available?pseudo=${encodeURIComponent(pseudo)}`);
    if (free.ok && !free.data.available) errors.pseudo = "Ce pseudo est déjà pris.";
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) errors.email = "Cette adresse e-mail n'est pas valide.";
  if (password.length < PASSWORD_MIN_LENGTH) errors.password = passwordHint;
  // Lot 36 : conditions générales, case obligatoire (tracée par l'API sur le profil).
  if (form.get("terms") !== "on") errors.terms = expressLabels.termsRequired;
  if (!(mainProfiles as readonly string[]).includes(mainProfile)) errors.mainProfile = arriveeLabels.errors.mainProfile;
  if (departments.length === 0) errors.departments = arriveeLabels.errors.departments;
  if (!firstName || firstName.length > 60) errors.firstName = arriveeLabels.errors.firstName;
  if (!lastName || lastName.length > 60) errors.lastName = arriveeLabels.errors.lastName;
  const values: SignupValues = { pseudo, email, mainProfile, departments, firstName, lastName };
  if (Object.keys(errors).length) return { ok: false, errors, status: 400, values };

  const res = await api(request, "/auth/sign-up/email", {
    method: "POST",
    json: {
      email,
      password,
      name: pseudo,
      mainProfile: mainProfile as MainProfile,
      departments,
      firstName,
      lastName,
      termsAccepted: true,
    },
  });
  if (!res.ok) {
    const message = String(res.error.message ?? "");
    const taken = res.status === 422 || /exist|already/i.test(message);
    errors[taken ? "email" : "form"] = taken
      ? "Un compte existe déjà avec cette adresse."
      : "Inscription impossible pour le moment.";
    return { ok: false, errors, status: res.status === 422 ? 409 : 400, values };
  }
  // Copie modifiable des en-têtes (cookies de session + effacement du cookie de lien d'ami, lot 15).
  const headers = withCookies(res.headers);
  const cookie = cookieFrom(res.headers);
  await applyInviteAfterSignup(request, cookie, headers);
  return { ok: true, headers, cookie };
}
