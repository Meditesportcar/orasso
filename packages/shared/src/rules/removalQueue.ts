// File des envois à supprimer (lot R9e, tour 1 ; même règles que `galleryUploads.ts` de l'appli) : un envoi retiré (photo retirée, décision ou
// cadres changés) occupe une place du quota d'envois en attente de l'API (40) tant qu'il n'est pas supprimé (`DELETE /me/uploads/:id`).
//
// - **Libérer avant de remplacer** : `release()` supprime tout de suite ce qui vient d'être retiré, avant que l'écran n'envoie la remplaçante.
// - **File persistante par compte** : une suppression qui échoue (hors ligne) reste dans la liste rangée sous le compte qui l'a créée
//   (`store`) et se rejoue (`replay()`, à l'ouverture de l'écran), jamais à la fin d'un envoi. Les suppressions passent une par une et
//   s'arrêtent à la première panne réseau. Si le compte de la liste n'est plus le compte connecté (`store.current()` faux), on ne lit,
//   n'écrit et ne supprime plus rien : jamais les envois de A dans la liste de B.
// - Tout est sérialisé : un `replay()` ne double jamais un `release()` en cours.

export type QueuedUpload = { id: string; key: string };

export type RemovalStore = {
  read: () => Promise<QueuedUpload[]>;
  write: (list: QueuedUpload[]) => Promise<void>;
  /** Faux dès que le compte de la liste n'est plus le compte connecté. */
  current?: () => boolean;
};

export type RemovalQueue = {
  /** Retire un envoi : il sera supprimé au prochain `release()` (ou rejoué plus tard s'il échoue). */
  retire: (upload: QueuedUpload) => void;
  /** Supprime tout de suite les envois retirés, avant d'en envoyer d'autres. */
  release: () => Promise<void>;
  /** Rejoue la liste persistante (suppressions restées en échec). */
  replay: () => Promise<void>;
};

export function createRemovalQueue(options: {
  remove: (upload: QueuedUpload) => Promise<unknown>;
  store: RemovalStore;
  /** Erreur de suppression qui arrête la série (panne réseau) ; par défaut, toutes. */
  stops?: (error: unknown) => boolean;
}): RemovalQueue {
  let retired: QueuedUpload[] = [];
  let chain: Promise<unknown> = Promise.resolve();
  const current = () => options.store.current?.() ?? true;
  const stops = options.stops ?? (() => true);
  const readStore = () => options.store.read().catch((): QueuedUpload[] => []);
  const writeStore = (list: QueuedUpload[]) => options.store.write(list).catch(() => undefined);

  function removeAll(uploads: readonly QueuedUpload[], replay: boolean): Promise<void> {
    const job = chain.then(async () => {
      if (!current()) return;
      const pending = [...(await readStore())];
      for (const u of uploads) if (!pending.some((p) => p.id === u.id)) pending.push(u);
      if (!current()) return;
      // Inscrites d'abord : une fermeture de l'application en plein nettoyage ne les perd pas.
      if (uploads.length > 0) await writeStore(pending);
      const removed = new Set<string>();
      for (const u of replay ? pending : uploads) {
        if (!current()) return;
        try {
          await options.remove(u);
          removed.add(u.id);
        } catch (e) {
          if (stops(e)) break;
        }
      }
      if (!current()) return;
      if (removed.size > 0) await writeStore(pending.filter((p) => !removed.has(p.id)));
    });
    chain = job.catch(() => undefined);
    return job.catch(() => undefined);
  }

  return {
    retire(upload) {
      if (!retired.some((u) => u.id === upload.id)) retired.push(upload);
    },
    release() {
      const list = retired;
      retired = [];
      return list.length > 0 ? removeAll(list, false) : chain.then(() => undefined);
    },
    replay() {
      return removeAll([], true);
    },
  };
}
