// Lot R3d (retour réel du 24/10 : un organisateur bloqué à « Qui es-tu ? » devant un bouton grisé) : ce qui manque pour
// créer un compte, dans l'ordre de l'écran, la première chose seulement. Règle pure, la même pour l'arrivée de l'appli,
// l'inscription du site et l'inscription express.
import { arriveeLabels } from "../labels/arrivee.fr";
import { pseudoSchema } from "../schemas/profile";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./password";

const M = arriveeLabels.missing;

/** Le champ en cause et la ligne à afficher. */
export type SignupMissing = {
  field: "profile" | "departments" | "pseudo" | "firstName" | "lastName" | "email" | "password" | "terms";
  text: string;
};

/** La disponibilité du pseudo, vérifiée à part (`idle` : pas encore vérifiée, ou vérification en panne). */
export type PseudoAvailability = "idle" | "checking" | "free" | "taken" | "invalid";

/** Longueur maximale d'une adresse e-mail (RFC 5321). */
export const EMAIL_MAX_LENGTH = 254;

/**
 * Une adresse e-mail a l'air complète : 254 caractères au plus, sans espace, un « @ » précédé d'au moins un caractère,
 * un point dans la partie qui suit, ni au début ni à la fin. Lecture en une passe (coût linéaire, tour 2 : la
 * regex d'avant pouvait coûter cher sur une longue saisie). Même règle dans l'appli et sur le site.
 */
export function emailLooksValid(email: string): boolean {
  const value = email.trim();
  if (value.length === 0 || value.length > EMAIL_MAX_LENGTH) return false;
  if (/\s/.test(value)) return false;
  const at = value.indexOf("@");
  if (at < 1) return false;
  const domain = value.slice(at + 1);
  const dot = domain.lastIndexOf(".");
  return dot > 0 && dot < domain.length - 1;
}

/** Ce qui ne va pas dans un mot de passe à créer, ou `null`. */
export function passwordMissing(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH)
    return M.password(PASSWORD_MIN_LENGTH, PASSWORD_MIN_LENGTH - password.length);
  if (password.length > PASSWORD_MAX_LENGTH) return M.passwordTooLong(PASSWORD_MAX_LENGTH);
  return null;
}

/** Ce qui manque pour le pseudo, ou `null`. Une vérification en panne (`idle`) ne bloque pas : l'API tranche à l'envoi. */
export function pseudoMissing(pseudo: string, availability: PseudoAvailability = "idle"): string | null {
  if (pseudo.length === 0) return M.pseudo;
  if (availability === "invalid" || !pseudoSchema.safeParse(pseudo).success) return M.pseudoInvalid;
  if (availability === "taken") return M.pseudoTaken;
  if (availability === "checking") return M.pseudoChecking;
  return null;
}

export type SignupDraft = {
  pseudo: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  terms: boolean;
};

/**
 * « Qui es-tu ? » : la première chose qui manque, dans l'ordre de l'écran (pseudo, prénom, nom, e-mail, mot de passe,
 * conditions), puis les départements choisis à l'étape d'avant (perdus si l'appli a été fermée). `null` : tout est prêt.
 */
export function identityMissing(
  draft: SignupDraft,
  pseudoAvailability: PseudoAvailability,
  departments: readonly string[] | null = null,
): SignupMissing | null {
  const pseudo = pseudoMissing(draft.pseudo, pseudoAvailability);
  if (pseudo) return { field: "pseudo", text: pseudo };
  if (!draft.firstName.trim()) return { field: "firstName", text: M.firstName };
  if (!draft.lastName.trim()) return { field: "lastName", text: M.lastName };
  if (!draft.email.trim()) return { field: "email", text: M.email };
  if (!emailLooksValid(draft.email)) return { field: "email", text: M.emailInvalid };
  const password = passwordMissing(draft.password);
  if (password) return { field: "password", text: password };
  if (!draft.terms) return { field: "terms", text: M.terms };
  if (departments && departments.length === 0) return { field: "departments", text: M.departments };
  return null;
}

/** Connexion (tour 2) : e-mail, puis mot de passe ; même ligne sous le bouton que dans l'arrivée. */
export function loginMissing(email: string, password: string): SignupMissing | null {
  if (!email.trim()) return { field: "email", text: M.email };
  if (!emailLooksValid(email)) return { field: "email", text: M.emailInvalid };
  const issue = passwordMissing(password);
  return issue ? { field: "password", text: issue } : null;
}

/** « Ton coin » : au moins un département. */
export function departmentsMissing(departments: readonly string[]): SignupMissing | null {
  return departments.length === 0 ? { field: "departments", text: M.departments } : null;
}

/** « Tu viens comment ? » : un profil choisi. */
export function profileMissing(profile: string | null): SignupMissing | null {
  return profile ? null : { field: "profile", text: M.profile };
}
