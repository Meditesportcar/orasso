/**
 * Longueur minimale d'un mot de passe, la même partout (lot 36) : inscription du site et de l'appli, inscription
 * express, invitations, réinitialisation, changement de mot de passe, et Better Auth côté API. docs/01 ne fixe pas de
 * longueur : 10 (choix consigné dans docs/JOURNAL-DES-CHOIX.md). Les comptes plus anciens dont le mot de passe est plus
 * court se connectent toujours (Better Auth ne contrôle la longueur qu'à la création et au changement).
 */
export const PASSWORD_MIN_LENGTH = 10;
/** Longueur maximale (celle de Better Auth). */
export const PASSWORD_MAX_LENGTH = 128;

/** Aide sous un champ « mot de passe » (création ou changement). */
export const passwordHint = `${PASSWORD_MIN_LENGTH} caractères au moins.`;

/** Message d'un mot de passe trop court, ou `null` s'il convient. */
export function passwordLengthProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Le mot de passe fait ${PASSWORD_MIN_LENGTH} caractères au moins.`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Le mot de passe fait ${PASSWORD_MAX_LENGTH} caractères au plus.`;
  return null;
}
