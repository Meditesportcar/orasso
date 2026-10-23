// Envoi idempotent d'un message écrit depuis la fiche (« Écrire à », lot M4, tour 2 : relectures Codex et Opus). Le même
// `clientId` et le même texte repartent tant que l'envoi n'est pas confirmé : si l'API a enregistré le message mais que
// sa réponse s'est perdue, le nouvel essai est reconnu (même identifiant) et ne publie pas de doublon. Logique pure.

/** Le message en cours d'envoi : son identifiant et son texte, figés jusqu'à la confirmation. */
export type Draft = { clientId: string; body: string };

/** Pas de réponse (réseau) ou erreur du serveur : le message a pu être enregistré, l'issue est inconnue. */
export const outcomeUnknown = (status: number) => status === 0 || status >= 500;

/**
 * Envoie `body`, ou le brouillon en attente s'il y en a un (même identifiant, même texte). Confirmé : plus de brouillon.
 * Refus clair de l'API (4xx) : rien n'a été enregistré, le brouillon tombe (le texte redevient modifiable). Issue
 * inconnue : le brouillon reste, le prochain essai le renvoie à l'identique.
 */
export async function sendOnce(
  state: { draft: Draft | null },
  body: string,
  makeId: () => string,
  send: (draft: Draft) => Promise<void>,
  statusOf: (error: unknown) => number,
): Promise<void> {
  const draft = state.draft ?? { clientId: makeId(), body };
  state.draft = draft;
  try {
    await send(draft);
    state.draft = null;
  } catch (error) {
    if (!outcomeUnknown(statusOf(error))) state.draft = null;
    throw error;
  }
}
