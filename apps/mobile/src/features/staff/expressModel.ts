// Inscription express : l'identifiant d'idempotence d'un envoi (R8p, tour 6), sans React ni réseau.
// Un résultat incertain (réseau, 5xx : le serveur a peut-être créé l'invitation) garde le même identifiant pour le nouvel essai et
// pour la file de reprise ; une réponse du serveur (succès, refus 4xx) règle l'envoi.

/** Le résultat d'un envoi dit-il qu'on ne sait pas si l'invitation a été créée ? */
export const isUncertainSend = (e: { status: number } | null | undefined): boolean =>
  e !== null && e !== undefined && (e.status === 0 || e.status >= 500);

export type PendingExpress = { email: string; id: string; queued: boolean };

/** L'identifiant de cet envoi : celui de l'essai incertain de la même adresse, sinon un nouveau. */
export function expressIdFor(pending: PendingExpress | null, email: string, fresh: () => string): PendingExpress {
  return pending && pending.email === email ? pending : { email, id: fresh(), queued: false };
}
