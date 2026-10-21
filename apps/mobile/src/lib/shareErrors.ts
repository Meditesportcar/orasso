// Erreurs de la carte à partager (lot 50) : pures, testées sans le téléphone (`shareVehicle.ts` en fait des `ApiRequestError`).

export const SHARE_LIMIT_MESSAGE = "Trop de cartes générées : réessaie plus tard.";
export const SHARE_NETWORK_MESSAGE = "Pas de connexion : réessaie quand le réseau revient.";
export const SHARE_FAILED_MESSAGE = "Impossible de générer la carte : réessaie dans un instant.";

export type ShareErrorInfo = { status: number; code: "rate_limited" | "network" | "internal"; message: string };

/**
 * L'erreur à montrer : le limiteur de l'API (429), le réseau (aucune réponse) ou autre chose. Sur le téléphone, le
 * téléchargement ne donne que le texte de l'erreur : on y cherche le code et les mots du réseau.
 */
export function shareErrorInfo(status: number | null, detail = ""): ShareErrorInfo {
  if (status === 429 || /[^0-9]429[^0-9]|^429|429$/.test(detail)) {
    return { status: 429, code: "rate_limited", message: SHARE_LIMIT_MESSAGE };
  }
  if (status === 0 || (status === null && /network|offline|internet|resolve|timed? ?out|connect/i.test(detail))) {
    return { status: 0, code: "network", message: SHARE_NETWORK_MESSAGE };
  }
  return { status: status ?? 500, code: "internal", message: SHARE_FAILED_MESSAGE };
}
