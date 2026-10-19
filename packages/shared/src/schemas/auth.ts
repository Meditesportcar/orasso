import { z } from "zod";
import { departmentSchema, mainProfiles } from "../enums";
import { arriveeLabels } from "../labels/arrivee.fr";
import { expressLabels } from "../labels/corrections.fr";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../rules/password";
import { pseudoSchema } from "./profile";

/**
 * Inscription ordinaire par e-mail (lot 41, DA v2) : corps de `POST /api/auth/sign-up/email`, site et appli. Le pseudo
 * est le champ `name` de Better Auth ; prénom et nom sont obligatoires et privés ; au moins un département (le
 * premier est le favori). L'inscription express du jour J a son propre schéma (`expressSignupSchema`).
 */
export const signUpSchema = z.object({
  email: z.email().max(200),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
  name: pseudoSchema,
  mainProfile: z.enum(mainProfiles, { error: arriveeLabels.errors.mainProfile }),
  departments: z.array(departmentSchema).min(1, arriveeLabels.errors.departments).max(20),
  firstName: z.string().trim().min(1, arriveeLabels.errors.firstName).max(60),
  lastName: z.string().trim().min(1, arriveeLabels.errors.lastName).max(60),
  /** Conditions générales acceptées (lot 36) : case obligatoire, tracée dans `profiles.terms_accepted_at`. */
  termsAccepted: z.literal(true, { error: expressLabels.termsRequired }),
});
export type SignUp = z.infer<typeof signUpSchema>;

/**
 * Ce que l'API contrôle elle-même sur `POST /api/auth/sign-up/email` : les champs ajoutés à Better Auth (profil,
 * départements, nom, conditions générales). L'e-mail, le mot de passe et le pseudo restent contrôlés par Better Auth.
 */
export const signUpRequiredSchema = signUpSchema.pick({
  mainProfile: true,
  departments: true,
  firstName: true,
  lastName: true,
  termsAccepted: true,
});
