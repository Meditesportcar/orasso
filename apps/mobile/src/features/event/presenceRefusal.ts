// Le refus de la présence par GPS en français (lot R7d2). Sans dépendance native : testable seul (une erreur de l'API se
// reconnaît à son code et à son statut, sans importer le client HTTP).
import { presenceLabels as L } from "@orasso/shared";

type ApiErrorLike = Error & { code: string; status: number };

const isApiError = (error: unknown): error is ApiErrorLike =>
  error instanceof Error &&
  typeof (error as ApiErrorLike).code === "string" &&
  typeof (error as ApiErrorLike).status === "number";

/** Le refus de l'API en français : le libellé du code, sinon le message de l'API (429, 5xx, réseau). */
export function refusalMessage(error: unknown): { message: string; code: string; refusal: boolean } {
  if (isApiError(error)) {
    const known = Object.hasOwn(L.errors, error.code) ? (L.errors as Record<string, string>)[error.code] : undefined;
    // `ticket_required` quand c'est complet : l'API renvoie « C'est complet… », mot pour mot celui du libellé de la règle.
    const full = error.code === "ticket_required" && error.message === L.ticketRequiredFull;
    if (known) return { message: full ? L.ticketRequiredFull : known, code: error.code, refusal: true };
    return { message: error.message, code: error.code, refusal: false };
  }
  return { message: L.genericFailure, code: "unknown", refusal: false };
}

/** Ce refus dit que le serveur a déjà la présence (réponse perdue puis nouvel essai) : la fiche se relit pour montrer « présent ». */
export const refusalMeansPresent = (code: string) => code === "already_present";
