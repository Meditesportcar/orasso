// Filet de sécurité de l'affiche à partager (lot M6, tour 4) : ce que permet l'état de la vérification de la plaque.

/**
 * État de la vérification pour l'affiche affichée. `slow` = la détection n'a pas répondu dans le délai ; pas d'état
 * (`undefined`) = pas encore vérifiée.
 */
export type PlateCheck = "checking" | "clear" | "server" | "found" | "masked" | "slow";

/** Délai maximal de la détection de plaque sur l'affiche (ML Kit) ; au-delà, « Vérifier à nouveau » ou partager. */
export const PLATE_CHECK_TIMEOUT_MS = 8_000;

/**
 * `checking` : en cours, pas d'état compris (le partage n'est jamais possible sans vérification) ; `blocked` : plaque
 * repérée ou vérification trop longue, le partage direct cède la place au choix confirmé. Sans affiche : rien.
 */
export function plateGate(check: PlateCheck | undefined, ready: boolean): { checking: boolean; blocked: boolean } {
  return {
    checking: ready && (check === undefined || check === "checking"),
    blocked: check === "found" || check === "slow",
  };
}
