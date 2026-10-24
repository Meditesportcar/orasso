// Brouillon de l'arrivée gardé sur l'appareil (lot R3d), sans dépendance au stockage réel : `persist.ts` le branche sur
// `kv`, les tests sur un stockage retardé. Tour 2 (relectures) : toutes les écritures et suppressions passent par une
// seule file, dans l'ordre ; une suppression demandée après une sauvegarde passe toujours après elle. Une connexion ou
// une déconnexion (`forget`) efface le brouillon **et** l'état en mémoire : la personne suivante sur le même téléphone
// ne retrouve rien de la précédente.
import { type ArriveeDraft, type ArriveeStep, arriveeInitial, type arriveeStore, draftOf, mergeDraft } from "./model";

export type DraftStorage = {
  get: () => Promise<unknown>;
  set: (draft: ArriveeDraft) => Promise<void>;
  del: () => Promise<void>;
};

type Store = typeof arriveeStore;

export function createDraftPersistence(store: Store, storage: DraftStorage, saveDelayMs = 300) {
  let persisting = true;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let resumeStep: ArriveeStep | null = null;
  let subscribed = false;
  /** Chaque `forget` change de génération : une relecture commencée avant n'applique plus rien. */
  let generation = 0;
  let queue: Promise<void> = Promise.resolve();

  /** Une tâche de stockage après toutes les autres ; une panne n'arrête jamais la file. */
  const enqueue = (task: () => Promise<void> | void): Promise<void> => {
    queue = queue.then(task).catch(() => undefined);
    return queue;
  };
  const cancelTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  function save() {
    cancelTimer();
    // `reset()` remet l'objet de départ : le brouillon s'efface, et la prochaine arrivée sera de nouveau gardée.
    if (store.get() === arriveeInitial) {
      persisting = true;
      void enqueue(() => storage.del());
      return;
    }
    if (!persisting) return;
    timer = setTimeout(() => {
      timer = null;
      if (!persisting) return;
      const draft = draftOf(store.get());
      void enqueue(() => (persisting ? storage.set(draft) : undefined));
    }, saveDelayMs);
  }

  function subscribe() {
    if (subscribed) return;
    subscribed = true;
    store.subscribe(save);
  }

  /** Relu une fois ; les écritures commencent ensuite (jamais avant la relecture). */
  const hydrated: Promise<void> = (async () => {
    const at = generation;
    const stored = await storage.get().catch(() => null);
    if (stored && at === generation) {
      store.set(mergeDraft(store.get(), stored));
      const step = (stored as { step?: unknown }).step;
      resumeStep = step === "departement" || step === "identite" ? step : null;
    }
    subscribe();
    // Ce qui a été choisi avant la relecture (lien partagé) est gardé aussitôt.
    if (store.get() !== arriveeInitial) save();
  })();

  return {
    hydrated,
    /** L'étape où reprendre après une fermeture de l'appli, donnée une seule fois par lancement. */
    takeResumeStep(): ArriveeStep | null {
      const step = resumeStep;
      resumeStep = null;
      return step;
    },
    /** Le compte est créé : le brouillon s'efface, rien n'est plus gardé jusqu'au prochain `reset()`. */
    finish(): Promise<void> {
      persisting = false;
      cancelTimer();
      return enqueue(() => storage.del());
    },
    /** Connexion à un compte ou déconnexion : brouillon et état en mémoire effacés. */
    forget(): Promise<void> {
      generation++;
      cancelTimer();
      resumeStep = null;
      persisting = true;
      store.reset();
      return enqueue(() => storage.del());
    },
    /** Attend la fin des écritures en cours (tests). */
    idle: (): Promise<void> => queue,
  };
}
