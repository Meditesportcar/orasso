// Écriture d'un réglage à interrupteur (lot R8n2, tour 3) : les envois sont sérialisés, le dernier choix gagne, et la
// réponse d'un envoi dépassé n'est jamais affichée. Pure (aucun React) : l'appli et le site la partagent.

export type SerialWriter<T> = {
  /** Le dernier choix de la personne : un envoi part tout de suite, ou à la suite de celui en cours. */
  set(value: T): void;
  /** Résolue quand plus rien n'est en cours : `true` si le dernier choix est enregistré, `false` s'il a échoué. */
  whenIdle(): Promise<boolean>;
  /** La dernière valeur confirmée par la réponse de l'API. */
  confirmed(): T;
};

export function createSerialWriter<T>(options: {
  initial: T;
  write: (value: T) => Promise<T>;
  /** Plus rien en cours : la valeur à afficher (le dernier choix confirmé). */
  onSettled: (value: T) => void;
  /** Un envoi a échoué : la dernière valeur confirmée, à rendre à l'interrupteur, et l'erreur. */
  onError: (confirmed: T, error: unknown) => void;
  /**
   * Garde vérifiée avant chaque envoi (comme `createFlameGate`) : fausse (autre compte, déconnexion), la file s'arrête sans
   * rien envoyer ni afficher. Sans elle, un envoi différé partirait avec la session du moment.
   */
  alive?: () => boolean;
}): SerialWriter<T> {
  let confirmed = options.initial;
  let desired = options.initial;
  let running: Promise<boolean> | null = null;
  let failed = false;

  // Après un échec, la valeur du serveur est inconnue (la réponse a pu se perdre) : un choix plus récent est envoyé même
  // s'il égale la dernière valeur confirmée.
  let unknown = false;

  async function loop(): Promise<boolean> {
    while (unknown || desired !== confirmed) {
      if (options.alive && !options.alive()) return true;
      const sent = desired;
      try {
        // Seule la réponse du dernier envoi compte : les envois ne se chevauchent jamais.
        confirmed = await options.write(sent);
        unknown = false;
      } catch (error) {
        if (desired !== sent) {
          unknown = true;
          continue;
        }
        unknown = false;
        desired = confirmed;
        failed = true;
        options.onError(confirmed, error);
        return false;
      }
    }
    if (options.alive && !options.alive()) return true;
    options.onSettled(confirmed);
    return true;
  }

  return {
    set(value) {
      desired = value;
      failed = false;
      if (!running) {
        running = loop().finally(() => {
          running = null;
        });
      }
    },
    async whenIdle() {
      // Un `set` posé pendant l'attente relance une boucle : on attend jusqu'à ce que plus rien ne tourne.
      while (running) await running;
      return !failed;
    },
    confirmed: () => confirmed,
  };
}
