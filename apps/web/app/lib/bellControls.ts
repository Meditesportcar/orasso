// Petit lot site (tour 5) : l'état de la lecture des préférences de la cloche et ce qu'il commande. Tant que la lecture n'a pas
// réussi, l'interrupteur est désactivé (un changement sans écrivain n'enverrait rien) ; en cas d'échec, l'erreur et « Réessayer ».

export type BellRead = "loading" | "ready" | "failed";

export const bellControls = (read: BellRead) => ({
  switchDisabled: read !== "ready",
  showError: read === "failed",
  showRetry: read === "failed",
});
