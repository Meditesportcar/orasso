import { PASSWORD_MIN_LENGTH } from "@orasso/shared";

// Formulaire de changement de mot de passe : contrôles purs (testés sans React Native).
/** Le formulaire est-il prêt à partir ? (longueur minimale partagée, confirmation identique, différent de l'actuel.) */
export function passwordFormError(current: string, next: string, confirm: string): string | null {
  if (!current) return "Saisis ton mot de passe actuel.";
  if (next.length < PASSWORD_MIN_LENGTH)
    return `Le nouveau mot de passe fait ${PASSWORD_MIN_LENGTH} caractères au moins.`;
  if (next === current) return "Choisis un mot de passe différent de l'actuel.";
  if (next !== confirm) return "Les deux nouveaux mots de passe ne sont pas identiques.";
  return null;
}
