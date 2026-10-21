// Envoi des photos d'une galerie (lot 57, relecture ; lot 59d) : un échec de publication ne doit pas bloquer la reprise.
// Les envois réussis sont gardés (par photo et zones floutées) et réutilisés à l'essai suivant ; ceux dont la photo a
// été retirée sont supprimés côté API (`DELETE /me/uploads/:id`) pour ne pas user le quota de fichiers.
//
// Une session sérialise tout ce qui touche à ces envois (publication, fermeture du formulaire, nettoyage) : une
// fermeture attend la fin d'une publication en cours, et une réouverture ne retrouve jamais un envoi en cours de
// suppression. Une suppression en échec (hors ligne) n'est pas oubliée : elle reste dans une liste à reprendre,
// séparée des envois réutilisables, et se rejoue à la prochaine occasion.

export type SentUpload = { id: string; key: string };
/** Envois déjà réussis, par signature de photo (`uploadSignature`). */
export type UploadCache = Map<string, SentUpload>;

type PhotoLike = { photo: { uri: string }; rects: readonly unknown[] };

export function uploadSignature(item: PhotoLike): string {
  return `${item.photo.uri}|${JSON.stringify(item.rects)}`;
}

/** Fermeture demandée pendant un envoi : les envois suivants sont abandonnés (ceux déjà faits seront supprimés). */
export class UploadsCancelled extends Error {
  constructor() {
    super("Envois interrompus");
  }
}

/**
 * Envoie les photos manquantes et rend les clés dans l'ordre des photos. Chaque envoi réussi est mémorisé tout de
 * suite (même si un envoi suivant échoue) ; les envois du cache qui ne correspondent plus à aucune photo sont retirés
 * du cache (avant tout `await`) et confiés à `retire`.
 */
export async function syncGalleryUploads(
  photos: readonly PhotoLike[],
  cache: UploadCache,
  send: (item: PhotoLike, index: number) => Promise<SentUpload>,
  retire: (upload: SentUpload) => void,
  onProgress?: (current: number, total: number) => void,
  shouldStop?: () => boolean,
): Promise<string[]> {
  const wanted = new Set(photos.map(uploadSignature));
  for (const [signature, upload] of [...cache]) {
    if (wanted.has(signature)) continue;
    cache.delete(signature);
    retire(upload);
  }
  const keys: string[] = [];
  for (const [i, item] of photos.entries()) {
    if (shouldStop?.()) throw new UploadsCancelled();
    onProgress?.(i + 1, photos.length);
    const signature = uploadSignature(item);
    let sent = cache.get(signature);
    if (!sent) {
      sent = await send(item, i);
      cache.set(signature, sent);
    }
    keys.push(sent.key);
  }
  return keys;
}

/** Suppressions à reprendre, rangées sous le compte concerné (le trousseau du compte en cours). */
export type RemovalStore = {
  read: () => Promise<SentUpload[]>;
  write: (list: SentUpload[]) => Promise<void>;
};

export type UploadSession = {
  /** Envois réutilisables d'une tentative à l'autre. */
  readonly cache: UploadCache;
  /**
   * Exécute `work` à son tour, après tout ce qui est déjà en file (publication, nettoyage). `work` reçoit les outils
   * de la session.
   */
  run: <T>(work: (tools: SessionTools) => Promise<T>) => Promise<T>;
  /** Formulaire fermé sans publier : attend la fin d'une publication en cours, puis supprime tous les envois gardés. */
  discard: () => Promise<void>;
  /** Rejoue les suppressions en échec (retour du réseau, ouverture du formulaire). */
  retryRemovals: () => Promise<void>;
};

export type SessionTools = {
  cache: UploadCache;
  /** Retire un envoi du cache (publication réussie : les fichiers sont consommés, rien à supprimer). */
  keepNothing: () => void;
  retire: (upload: SentUpload) => void;
  /** Vrai si la fermeture du formulaire a été demandée pendant ce travail. */
  stopped: () => boolean;
};

export function createUploadSession(options: {
  remove: (upload: SentUpload) => Promise<unknown>;
  store: RemovalStore;
}): UploadSession {
  const cache: UploadCache = new Map();
  let tail: Promise<unknown> = Promise.resolve();
  let closing = 0;
  // Retirés du cache, pas encore confiés à la liste à reprendre (le tout se vide dans `flushRetired`).
  let retired: SentUpload[] = [];

  const readStore = () => options.store.read().catch((): SentUpload[] => []);
  const writeStore = (list: SentUpload[]) => options.store.write(list).catch(() => undefined);

  /** Supprime côté API ; ce qui échoue reste dans la liste à reprendre (jamais dans le cache). */
  async function removeAll(uploads: readonly SentUpload[]): Promise<void> {
    const pending = [...(await readStore())];
    for (const u of uploads) if (!pending.some((p) => p.id === u.id)) pending.push(u);
    // Inscrites d'abord : une fermeture de l'application en plein nettoyage ne les perd pas.
    await writeStore(pending);
    const left: SentUpload[] = [];
    for (const u of pending) {
      try {
        await options.remove(u);
      } catch {
        left.push(u);
      }
    }
    if (pending.length > 0) await writeStore(left);
  }

  const flushRetired = async () => {
    const list = retired;
    retired = [];
    await removeAll(list);
  };

  const tools: SessionTools = {
    cache,
    keepNothing: () => cache.clear(),
    retire: (u) => {
      retired.push(u);
    },
    stopped: () => closing > 0,
  };

  function run<T>(work: (t: SessionTools) => Promise<T>): Promise<T> {
    const job = tail.then(async () => {
      try {
        return await work(tools);
      } finally {
        await flushRetired();
      }
    });
    tail = job.catch(() => undefined);
    return job;
  }

  return {
    cache,
    run,
    discard() {
      // Demandé tout de suite : une publication en cours cesse d'envoyer ; le nettoyage passe après elle.
      closing += 1;
      return run(async () => {
        for (const u of [...cache.values()]) retired.push(u);
        cache.clear();
        closing -= 1;
      });
    },
    retryRemovals() {
      return run(async () => undefined);
    },
  };
}
