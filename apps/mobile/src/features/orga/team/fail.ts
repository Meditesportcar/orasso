// Erreur d'une écriture de la casquette Organisateur faite dans une feuille (lot 35a) : le message de l'API reste dans
// la feuille (la saisie n'est pas perdue) ; le refus pour double authentification remonte à l'écran, qui ouvre l'étape
// de second facteur déjà présente (`OrgaFailure`).
import { errorMessage } from "@/lib/http";
import { isTwoFactorError } from "@/lib/orga";

export function failWith(error: unknown, local: (message: string) => void, bubble: (error: unknown) => void): void {
  if (isTwoFactorError(error)) bubble(error);
  else local(errorMessage(error));
}
