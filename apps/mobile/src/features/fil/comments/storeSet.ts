// Un magasin de commentaires par compte **et** par casquette, conservés au changement de casquette (R9n, tour 2, point 8) : après
// « échec sous A → B → retour à A », le brouillon et le commentaire en échec sont toujours là et repartent au nom de A. Seul un
// autre compte (ou la déconnexion) vide tout. La façade a la forme d'un `PostLiveStore` : `postLive.xxx` agit sur le magasin courant.
import { createPostLiveStore, type PostLiveStore } from "@orasso/shared";

/** Le compte d'une portée `compte|acteur` (`commentsScope`). */
const accountOf = (scope: string): string => scope.split("|")[0] ?? scope;

export function createPostLiveSet() {
  const stores = new Map<string, PostLiveStore>();
  const listeners = new Set<() => void>();
  let scope: string | null | undefined;
  let epoch = 0;
  let current: PostLiveStore = createPostLiveStore();
  let off: (() => void) | null = null;
  const notify = () => {
    for (const l of listeners) l();
  };
  const attach = () => {
    off?.();
    off = current.subscribe(notify);
  };
  attach();

  const facade = {
    /** La portée courante : sa première utilisation crée son magasin ; un autre compte vide tous les magasins. */
    setAccount(next: string | null, silent = false) {
      if (next === scope) return;
      const previous = scope;
      scope = next;
      if (next === null) {
        stores.clear();
        current = createPostLiveStore();
      } else {
        if (previous && accountOf(previous) !== accountOf(next)) stores.clear();
        let store = stores.get(next);
        if (!store) {
          store = createPostLiveStore();
          store.setAccount(next, true);
          stores.set(next, store);
        }
        current = store;
      }
      epoch += 1;
      attach();
      if (!silent) notify();
    },
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    /** Change aussi quand on passe d'un magasin à un autre (deux magasins peuvent avoir le même compteur). */
    version: () => current.version() + epoch * 1_000_000,
    /** Déconnexion : tout s'en va, tous les magasins. */
    clear(silent = false) {
      stores.clear();
      scope = undefined;
      current = createPostLiveStore();
      epoch += 1;
      attach();
      if (!silent) notify();
    },
  };
  return new Proxy(facade, {
    get(target, key, receiver) {
      if (key in target) return Reflect.get(target, key, receiver);
      const value = (current as unknown as Record<PropertyKey, unknown>)[key];
      return typeof value === "function" ? value.bind(current) : value;
    },
  }) as PostLiveStore;
}
