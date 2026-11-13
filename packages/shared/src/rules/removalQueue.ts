// File des opérations à confirmer (lot R9e, tours 1 à 3 ; mêmes règles que `galleryUploads.ts` de l'appli) : un envoi retiré (photo retirée,
// décision ou cadres changés) occupe une place du quota d'envois en attente de l'API (40) tant qu'il n'est pas supprimé
// (`DELETE /me/uploads/:id`) ; l'**annulation de l'ajout d'une photo** (`DELETE /me/albums/:id/photos/by-client/:clientId`, atomique côté
// API) doit être confirmée par un 204 avant qu'on la tienne pour faite.
//
// **Règle (tour 3)** : une opération **entre dans la file avant son premier appel réseau**, en mémoire (`hasPending()` est vrai tout de suite)
// **et** dans la liste persistante du compte (`store`), et n'en sort que sur une réponse qui prouve son issue :
// - 2xx (204) : confirmée ;
// - refus **définitif** (`final` : 400, 404, 409, 422 pour l'API d'albums) : l'opération sort des listes, mais **pas en silence** : elle va dans
//   `takeDropped()` (état d'échec visible), l'écran relit l'album et les photos concernées **réapparaissent** avant toute publication ;
// - tout le reste (réseau, 5xx, 408, 429, **401 et 403** : session expirée, droits en cours de rétablissement) : l'opération **reste**, rejouée
//   plus tard sous la même session (`stops` arrête la série pour ne pas marteler l'API).
// La file appartient à un compte **et à une session** : si `store.current()` devient faux (autre compte, autre session), on ne lit, n'écrit et
// ne joue plus rien ; le stockage de A reste intact. Tout est sérialisé : un `replay()` ne double jamais une opération en cours. Les annulations
// passent avant les suppressions d'envois (une photo non confirmée absente ne doit pas perdre son envoi).

/** Un envoi à supprimer (`id`, `key`) ou une annulation d'ajout à confirmer (`albumId`, `clientId`). */
export type QueuedOp = { id: string; key?: string; albumId?: string; clientId?: string };
/** Ancien nom (lot R9e, tour 1) : les envois à supprimer. */
export type QueuedUpload = QueuedOp;

/** L'annulation d'ajout d'une photo : son identifiant de file est stable (une seule par tentative). */
export const cancelOp = (albumId: string, clientId: string): QueuedOp => ({
  id: `cancel:${albumId}:${clientId}`,
  albumId,
  clientId,
});

/** Codes qui prouvent que l'opération n'a plus d'objet ou ne peut pas aboutir : 400, 404, 409, 422. Tout autre refus (dont 401 et 403) reste en file. */
export const DEFINITIVE_STATUSES: readonly number[] = [400, 404, 409, 422];
export const isDefinitiveStatus = (status: number): boolean => DEFINITIVE_STATUSES.includes(status);

export type RemovalStore = {
  read: () => Promise<QueuedOp[]>;
  write: (list: QueuedOp[]) => Promise<void>;
  /** Faux dès que le compte de la liste n'est plus le compte connecté, ou que la session a changé. */
  current?: () => boolean;
};

/** Issue d'une opération mise en file : confirmée, encore en attente (hors ligne, session, 5xx…), ou refusée pour de bon. */
export type RemovalOutcome = "confirmed" | "pending" | "refused";
export type DroppedOp = { op: QueuedOp; error: unknown };

export type RemovalQueue = {
  /** Met un envoi à supprimer en file (mémoire tout de suite, stockage ensuite) ; exécuté au prochain `release()`. */
  retire: (op: QueuedOp) => void;
  /** Met l'opération en file (mémoire **et** stockage) **avant** tout appel réseau, l'exécute et rend son issue. */
  enqueue: (op: QueuedOp) => Promise<RemovalOutcome>;
  /** Exécute tout ce qui n'est pas confirmé (avant d'envoyer autre chose). */
  release: () => Promise<void>;
  /** Rejoue la file : ouverture de l'écran, retour du réseau. */
  replay: () => Promise<void>;
  /** Des opérations ne sont pas confirmées, **y compris celles en cours d'appel** (la publication attend). */
  hasPending: () => boolean;
  /** Les opérations refusées pour de bon depuis le dernier appel (état d'échec visible) ; `only` en retire une seule. */
  takeDropped: (only?: string) => DroppedOp[];
  /** Les opérations non confirmées (pour ne pas montrer à nouveau une photo dont le retrait attend). */
  pendingOps: () => QueuedOp[];
};

export function createRemovalQueue(options: {
  remove: (op: QueuedOp) => Promise<unknown>;
  store: RemovalStore;
  /** Erreur qui arrête la série (panne réseau, 401, 403) ; par défaut, toutes. */
  stops?: (error: unknown) => boolean;
  /** Refus définitif de l'API : l'opération sort des listes avec une trace et un état d'échec (`takeDropped`), jamais rejouée. */
  final?: (error: unknown) => boolean;
  onDrop?: (op: QueuedOp, error: unknown) => void;
}): RemovalQueue {
  /** Les opérations non confirmées, **en mémoire** : indépendantes du stockage (qui peut refuser d'écrire ou de lire). */
  const unconfirmed = new Map<string, QueuedOp>();
  let dropped: DroppedOp[] = [];
  let chain: Promise<unknown> = Promise.resolve();
  let writes: Promise<unknown> = Promise.resolve();
  let loaded: Promise<void> | null = null;
  const current = () => options.store.current?.() ?? true;
  const stops = options.stops ?? (() => true);
  const final = options.final ?? (() => false);

  /** Lit une fois la liste persistante (séances précédentes) : elle entre en mémoire avant toute écriture, jamais écrasée. */
  function loadOnce(): Promise<void> {
    if (!current()) return Promise.resolve();
    if (!loaded) {
      loaded = options.store
        .read()
        .catch((): QueuedOp[] => [])
        .then((stored) => {
          for (const u of stored) if (!unconfirmed.has(u.id)) unconfirmed.set(u.id, u);
        });
    }
    return loaded;
  }

  /** Écrit l'état en mémoire (le dernier gagne), en série ; sans compte courant, rien n'est écrit. */
  async function persist(): Promise<void> {
    await loadOnce();
    if (!current()) return;
    const snapshot = [...unconfirmed.values()];
    const job = writes.then(() => (current() ? options.store.write(snapshot) : undefined)).catch(() => undefined);
    writes = job;
    await job;
  }

  function drain(): Promise<void> {
    const job = chain.then(async () => {
      await loadOnce();
      // Les annulations d'abord (une photo non confirmée absente ne doit pas voir son envoi supprimé), puis les envois.
      const todo = [...unconfirmed.values()].sort(
        (a, b) => Number(b.clientId !== undefined) - Number(a.clientId !== undefined),
      );
      for (const u of todo) {
        if (!current()) return;
        try {
          await options.remove(u);
          unconfirmed.delete(u.id);
          await persist();
        } catch (e) {
          if (final(e)) {
            unconfirmed.delete(u.id);
            dropped.push({ op: u, error: e });
            options.onDrop?.(u, e);
            await persist();
          } else if (stops(e)) break;
        }
      }
    });
    chain = job.catch(() => undefined);
    return job.catch(() => undefined);
  }

  return {
    retire(op) {
      if (!unconfirmed.has(op.id)) unconfirmed.set(op.id, op);
      void persist();
    },
    async enqueue(op) {
      // En mémoire d'abord (synchrone : `hasPending()` est vrai dès maintenant), puis dans la liste persistante, **avant** le premier appel.
      unconfirmed.set(op.id, op);
      await persist();
      await drain();
      if (unconfirmed.has(op.id)) return "pending";
      return dropped.some((d) => d.op.id === op.id) ? "refused" : "confirmed";
    },
    release: drain,
    replay: drain,
    hasPending: () => unconfirmed.size > 0,
    pendingOps: () => [...unconfirmed.values()],
    takeDropped(only) {
      const taken = only ? dropped.filter((d) => d.op.id === only) : dropped;
      dropped = only ? dropped.filter((d) => d.op.id !== only) : [];
      return taken;
    },
  };
}
