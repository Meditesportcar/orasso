// File des opérations à confirmer (lot R9e, tours 1 et 2 ; mêmes règles que `galleryUploads.ts` de l'appli) : un envoi retiré (photo retirée,
// décision ou cadres changés) occupe une place du quota d'envois en attente de l'API (40) tant qu'il n'est pas supprimé
// (`DELETE /me/uploads/:id`) ; l'**annulation de l'ajout d'une photo** (`DELETE /me/albums/:id/photos/by-client/:clientId`, atomique côté
// API) doit être confirmée par un 204 avant qu'on la tienne pour faite.
//
// - **Libérer avant de remplacer** : `release()` supprime tout de suite ce qui vient d'être retiré **et rejoue ce qui n'était pas confirmé**,
//   avant que l'écran n'envoie quoi que ce soit.
// - **Une opération non confirmée reste** dans une liste **en mémoire** (indépendante du stockage) **et** dans la liste persistante par compte
//   (`store`) : un stockage indisponible ne la fait pas oublier dans la page, une fermeture de l'application ne la perd pas. `replay()` rejoue
//   les deux (ouverture de l'écran, retour du réseau, début d'un envoi).
// - Une opération rejetée par l'API pour une raison **définitive** (`final`, un 4xx qui n'est pas une panne passagère) sort des listes avec une
//   trace (`onDrop`) : elle n'est pas rejouée sans fin. Seules les pannes réseau et les 5xx restent à rejouer ; une panne réseau arrête la
//   série (`stops`).
// - Si le compte de la liste n'est plus le compte connecté (`store.current()` faux), on ne lit, n'écrit et ne supprime plus rien : jamais les
//   opérations de A dans la liste de B.
// - Tout est sérialisé : un `replay()` ne double jamais un `release()` en cours.

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

export type RemovalStore = {
  read: () => Promise<QueuedOp[]>;
  write: (list: QueuedOp[]) => Promise<void>;
  /** Faux dès que le compte de la liste n'est plus le compte connecté. */
  current?: () => boolean;
};

export type RemovalQueue = {
  /** Retire un envoi ou annule un ajout : fait au prochain `release()` (ou rejoué plus tard s'il n'est pas confirmé). */
  retire: (op: QueuedOp) => void;
  /** Exécute tout de suite ce qui vient d'être retiré **et** ce qui n'était pas confirmé, avant d'envoyer autre chose. */
  release: () => Promise<void>;
  /** Rejoue les deux listes (mémoire et persistante) : ouverture de l'écran, retour du réseau. */
  replay: () => Promise<void>;
  /** Des opérations ne sont pas confirmées (la publication attend). */
  hasPending: () => boolean;
};

export function createRemovalQueue(options: {
  remove: (op: QueuedOp) => Promise<unknown>;
  store: RemovalStore;
  /** Erreur qui arrête la série (panne réseau) ; par défaut, toutes. */
  stops?: (error: unknown) => boolean;
  /** Refus définitif de l'API : l'opération sort des listes (jamais rejouée), avec une trace. */
  final?: (error: unknown) => boolean;
  onDrop?: (op: QueuedOp, error: unknown) => void;
}): RemovalQueue {
  let retired: QueuedOp[] = [];
  /** Les opérations non confirmées, **en mémoire** : indépendantes du stockage (qui peut refuser d'écrire ou de lire). */
  const unconfirmed = new Map<string, QueuedOp>();
  let chain: Promise<unknown> = Promise.resolve();
  const current = () => options.store.current?.() ?? true;
  const stops = options.stops ?? (() => true);
  const final = options.final ?? (() => false);
  const readStore = () => options.store.read().catch((): QueuedOp[] => []);
  const writeStore = (list: QueuedOp[]) => options.store.write(list).catch(() => undefined);

  function run(uploads: readonly QueuedOp[], replay: boolean): Promise<void> {
    const job = chain.then(async () => {
      if (!current()) return;
      // Les nouvelles opérations entrent d'abord en mémoire (le stockage ne décide pas de ce qui est oublié).
      for (const u of uploads) unconfirmed.set(u.id, u);
      const stored = await readStore();
      if (!current()) return;
      const pending = new Map<string, QueuedOp>();
      // Celles de la liste persistante (d'une séance précédente) deviennent aussi des opérations en mémoire : si le stockage refuse ensuite
      // d'écrire, la page ne les oublie pas.
      for (const u of stored) {
        pending.set(u.id, u);
        unconfirmed.set(u.id, u);
      }
      for (const u of unconfirmed.values()) pending.set(u.id, u);
      // Inscrites d'abord : une fermeture de l'application en plein nettoyage ne les perd pas.
      if (uploads.length > 0) await writeStore([...pending.values()]);
      // Les annulations d'abord (une photo qui n'est pas confirmée absente ne doit pas voir son envoi supprimé), puis les envois.
      const todo = [...(replay ? pending.values() : uploads)].sort(
        (a, b) => Number(b.clientId !== undefined) - Number(a.clientId !== undefined),
      );
      for (const u of todo) {
        if (!current()) return;
        try {
          await options.remove(u);
          pending.delete(u.id);
          unconfirmed.delete(u.id);
        } catch (e) {
          if (final(e)) {
            pending.delete(u.id);
            unconfirmed.delete(u.id);
            options.onDrop?.(u, e);
          } else if (stops(e)) break;
        }
      }
      if (!current()) return;
      await writeStore([...pending.values()]);
    });
    chain = job.catch(() => undefined);
    return job.catch(() => undefined);
  }

  return {
    retire(op) {
      if (!retired.some((u) => u.id === op.id)) retired.push(op);
    },
    release() {
      const list = retired;
      retired = [];
      // Ce qui n'était pas confirmé est rejoué avec ce qui vient d'être retiré : la place du quota est libérée avant tout nouvel envoi.
      return list.length > 0 || unconfirmed.size > 0 ? run(list, true) : chain.then(() => undefined);
    },
    replay() {
      return run([], true);
    },
    hasPending() {
      return retired.length > 0 || unconfirmed.size > 0;
    },
  };
}
