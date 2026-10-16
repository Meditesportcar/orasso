// Formulaire de changement de mot de passe : contrôles purs (testés sans React Native).
/** Le formulaire est-il prêt à partir ? (8 caractères au moins, confirmation identique, différent de l'actuel.) */
export function passwordFormError(current: string, next: string, confirm: string): string | null {
  if (!current) return "Saisis ton mot de passe actuel.";
  if (next.length < 8) return "Le nouveau mot de passe fait 8 caractères au moins.";
  if (next === current) return "Choisis un mot de passe différent de l'actuel.";
  if (next !== confirm) return "Les deux nouveaux mots de passe ne sont pas identiques.";
  return null;
}
