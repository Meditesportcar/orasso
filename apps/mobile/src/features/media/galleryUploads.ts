// Envoi des photos d'une galerie (lot 57, relecture ; lot 59d) : un échec de publication ne doit pas bloquer la reprise.
// Les envois réussis sont gardés (par photo et zones floutées) et réutilisés à l'essai suivant ; ceux dont la photo a
// été retirée sont supprimés côté API (`DELETE /me/uploads/:id`) pour ne pas user le quota de fichiers.
//
// Une session sérialise tout ce qui touche à ces envois (publication, fermeture du formulaire) : une fermeture attend la
// fin d'une publication en cours, et une réouverture ne retrouve jamais un envoi en cours de suppression. Une
// suppression en échec (hors ligne) n'est pas oubliée : elle reste dans une liste à reprendre, séparée des envois
// réutilisables, et se rejoue à l'ouverture du formulaire seulement (tour 2 : jamais à la fin d'une publication, qui
// s'affiche sans attendre les anciennes suppressions). Les suppressions passent une par une et s'arrêtent à la
// première panne réseau (30 délais de 15 s figeraient la file). La liste est rangée sous le compte qui l'a créée.

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
 * du cache (avant tout `await`) et confiés à `retire`, puis supprimés par `release` AVANT les nouveaux envois : leurs
 * places dans le plafond d'envois en attente de l'API (40) sont libérées pour leurs remplaçantes.
 */
export async function syncGalleryUploads(
  photos: readonly PhotoLike[],
  cache: UploadCache,
  send: (item: PhotoLike, index: number) => Promise<SentUpload>,
  retire: (upload: SentUpload) => void,
  onProgress?: (current: number, total: number) => void,
  shouldStop?: () => boolean,
  release?: () => Promise<void>,
): Promise<string[]> {
  const wanted = new Set(photos.map(uploadSignature));
  let retired = false;
  for (const [signature, upload] of [...cache]) {
    if (wanted.has(signature)) continue;
    cache.delete(signature);
    retire(upload);
    retired = true;
  }
  if (retired) await release?.();
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

/** Suppressions à reprendre, rangées sous le compte qui les a créées (`removalStore.ts`). */
export type RemovalStore = {
  read: () => Promise<SentUpload[]>;
  write: (list: SentUpload[]) => Promise<void>;
  /** Faux dès que le compte de la liste n'est plus le compte connecté : les suppressions s'arrêtent. */
  current?: () => boolean;
};

export type UploadSession = {
  /** Envois réutilisables d'une tentative à l'autre. */
  readonly cache: UploadCache;
  /**
   * Exécute `work` à son tour, après tout ce qui est déjà en file (publication, fermeture). `work` reçoit les outils
   * de la session.
   */
  run: <T>(work: (tools: SessionTools) => Promise<T>) => Promise<T>;
  /** Formulaire fermé sans publier : attend la fin d'une publication en cours, puis supprime tous les envois gardés. */
  discard: () => Promise<void>;
  /** Rejoue les suppressions en échec (ouverture du formulaire), hors de la file des publications. */
  retryRemovals: () => Promise<void>;
};

export type SessionTools = {
  cache: UploadCache;
  /** Retire un envoi du cache (publication réussie : les fichiers sont consommés, rien à supprimer). */
  keepNothing: () => void;
  retire: (upload: SentUpload) => void;
  /** Supprime tout de suite les envois retirés (avant d'en envoyer d'autres). */
  release: () => Promise<void>;
  /** Vrai si la fermeture du formulaire a été demandée pendant ce travail. */
  stopped: () => boolean;
};

export function createUploadSession(options: {
  remove: (upload: SentUpload) => Promise<unknown>;
  store: RemovalStore;
  /** Erreur de suppression qui arrête la série (panne réseau) ; par défaut, toutes. */
  stopsRemovals?: (error: unknown) => boolean;
}): UploadSession {
  const cache: UploadCache = new Map();
  let tail: Promise<unknown> = Promise.resolve();
  let removals: Promise<unknown> = Promise.resolve();
  let closing = 0;
  // Retirés du cache, pas encore confiés à la liste à reprendre (le tout se vide dans `flushRetired`).
  let retired: SentUpload[] = [];
  const current = () => options.store.current?.() ?? true;
  const stops = options.stopsRemovals ?? (() => true);

  const readStore = () => options.store.read().catch((): SentUpload[] => []);
  const writeStore = (list: SentUpload[]) => options.store.write(list).catch(() => undefined);

  /**
   * Inscrit `uploads` dans la liste à reprendre puis les supprime côté API (`replay` : toute la liste). Une à la fois,
   * arrêt à la première panne réseau ; ce qui n'est pas supprimé reste dans la liste (jamais dans le cache). Si le
   * compte de la liste n'est plus le compte connecté, on s'arrête sans rien écrire.
   */
  function removeAll(uploads: readonly SentUpload[], replay: boolean): Promise<void> {
    const job = removals.then(async () => {
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
    removals = job.catch(() => undefined);
    return job.catch(() => undefined);
  }

  const flushRetired = async () => {
    const list = retired;
    retired = [];
    if (list.length > 0) await removeAll(list, false);
  };

  const tools: SessionTools = {
    cache,
    keepNothing: () => cache.clear(),
    retire: (u) => {
      retired.push(u);
    },
    release: flushRetired,
    stopped: () => closing > 0,
  };

  function run<T>(work: (t: SessionTools) => Promise<T>): Promise<T> {
    const job = tail.then(async () => {
      try {
        return await work(tools);
      } finally {
        // Seulement ce que ce travail a retiré : jamais le rejeu de toute la liste.
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
      return removeAll([], true);
    },
  };
}

/**
 * Publication d'un contenu (formulaire « Ajouter ») : envoi des photos d'une galerie, attente de la fin de l'animation
 * d'envoi, puis création. Une fermeture demandée entre-temps (même pendant l'attente) abandonne sans créer
 * (`UploadsCancelled`, que le formulaire n'affiche pas) ; une création réussie consomme les envois.
 */
export async function publishContent(
  tools: SessionTools,
  options: {
    /** Photos de la galerie, ou `null` pour un lien. */
    photos: readonly PhotoLike[] | null;
    send: (item: PhotoLike, index: number) => Promise<SentUpload>;
    onProgress?: (current: number, total: number) => void;
    onSent?: () => void;
    parked?: () => Promise<void>;
    create: (photoKeys: string[]) => Promise<unknown>;
  },
): Promise<void> {
  let keys: string[] = [];
  if (options.photos) {
    // Les envois réussis sont gardés d'un essai à l'autre : une panne de publication ne renvoie pas les 30 photos.
    keys = await syncGalleryUploads(
      options.photos,
      tools.cache,
      options.send,
      tools.retire,
      options.onProgress,
      tools.stopped,
      tools.release,
    );
    options.onSent?.();
    await options.parked?.();
    if (tools.stopped()) throw new UploadsCancelled();
  }
  await options.create(keys);
  // Publié : les fichiers sont consommés, plus rien à garder ni à supprimer.
  tools.keepNothing();
}

/** Les fonctions du cache par compte (`@/lib/kv`), passées par le formulaire. */
export type AccountCache = {
  accountGuard: () => { scope: string | null; current: () => boolean };
  cacheGetJson: <T>(key: string) => Promise<T | null>;
  cacheSetJson: (key: string, value: unknown, scope?: string | null) => Promise<void>;
};

export const PENDING_REMOVALS_KEY = "media-pending-upload-removals";

/**
 * Liste des suppressions à reprendre, liée au compte connecté AU MOMENT où elle est créée (tour 2). Après une
 * déconnexion ou un changement de compte, elle ne lit plus rien, n'écrit plus rien et arrête les suppressions : jamais
 * les identifiants ni les clés des photos de A dans le cache de B.
 */
export function accountRemovalStore(kv: AccountCache): RemovalStore {
  const guard = kv.accountGuard();
  const current = () => guard.scope !== null && guard.current();
  return {
    current,
    read: async () => {
      if (!current()) return [];
      const list = await kv.cacheGetJson<SentUpload[]>(PENDING_REMOVALS_KEY);
      return current() ? (list ?? []) : [];
    },
    // Écrite sous le compte de départ seulement (rien si le compte lié a changé).
    write: (list) => kv.cacheSetJson(PENDING_REMOVALS_KEY, list, guard.scope),
  };
}
