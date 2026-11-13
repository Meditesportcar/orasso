// L'acteur de chaque commentaire envoyé, pris au moment du geste et gardé pour tous ses essais (R9n, tour 1, point 2 ; tour 2) :
// « Réessayer » repart au nom de la casquette où le commentaire a été écrit, jamais de celle d'au moment du réessai.
const senders = new Map<string, string | null>();

export const rememberSender = (clientId: string, actor: string | null): void => void senders.set(clientId, actor);

/** L'acteur de cet envoi ; `current` seulement pour un envoi inconnu. */
export const senderOf = (clientId: string, current: string | null): string | null =>
  senders.has(clientId) ? (senders.get(clientId) ?? null) : current;

export const forgetSender = (clientId: string): void => void senders.delete(clientId);

/** Déconnexion ou autre compte : plus aucun envoi n'est mémorisé. */
export const clearSenders = (): void => senders.clear();
