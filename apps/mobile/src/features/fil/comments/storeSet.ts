// Un magasin de commentaires par compte **et** par casquette, conservés au changement de casquette (R9n, tours 2 et 3) : voir le modèle
// en tête de `scope.ts`. La façade a la forme d'un `PostLiveStore` : `postLive.xxx` agit sur le magasin de la casquette active, sauf
// les écritures portées par un ticket (elles vont au magasin du ticket) et l'état d'écran commun (`opening`, `hosts`).
import { createPostLiveStore, type LiveTicket, type PostLiveStore, type ReadTicket } from "@orasso/shared";

/** Le compte d'une portée `compte|acteur` (`commentsScope`). */
const accountOf = (scope: string): string => scope.split("|")[0] ?? scope;

/** Un ticket porte sa portée (`s`) et l'identité du magasin qui l'a émis (`i`) : un magasin recréé (déconnexion, autre compte, même portée) ne reconnaît pas les tickets d'avant. */
export type ScopedTicket = LiveTicket & { s: string | null; i: number };
export type ScopedReadTicket = ReadTicket & { s: string | null; i: number };

const SHARED_KEYS = new Set<PropertyKey>(["opening", "open", "close", "register", "setFocused", "host"]);

export function createPostLiveSet() {
  const stores = new Map<string, { store: PostLiveStore; uid: number }>();
  let uids = 0;
  let currentUid = 0;
  /** L'état d'écran commun à toutes les casquettes du compte : la feuille ouverte et les hôtes montés. */
  let shared = createPostLiveStore();
  const listeners = new Set<() => void>();
  let scope: string | null | undefined;
  let epoch = 0;
  let current: PostLiveStore = createPostLiveStore();
  let offs: (() => void)[] = [];
  const notify = () => {
    for (const l of listeners) l();
  };
  const attach = () => {
    for (const o of offs) o();
    offs = [current.subscribe(notify), shared.subscribe(notify)];
  };
  attach();
  const storeOf = (t: { s?: string | null; i?: number }): PostLiveStore | null => {
    if (t.s === undefined) return current;
    if (t.s === null) return null;
    const entry = stores.get(t.s);
    return entry && entry.uid === t.i ? entry.store : null;
  };
  const tagged = <T extends LiveTicket>(t: T): T & { s: string | null; i: number } => ({
    ...t,
    s: scope ?? null,
    i: currentUid,
  });

  const facade = {
    /** La portée courante : sa première utilisation crée son magasin ; un autre compte vide tous les magasins. */
    setAccount(next: string | null, silent = false) {
      if (next === scope) return;
      const previous = scope;
      scope = next;
      if (next === null) {
        stores.clear();
        current = createPostLiveStore();
        currentUid = ++uids;
        shared = createPostLiveStore();
      } else {
        if (previous && accountOf(previous) !== accountOf(next)) {
          stores.clear();
          shared = createPostLiveStore();
        }
        let entry = stores.get(next);
        if (!entry) {
          const store = createPostLiveStore();
          store.setAccount(next, true);
          entry = { store, uid: ++uids };
          stores.set(next, entry);
        }
        current = entry.store;
        currentUid = entry.uid;
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
    version: () => current.version() + shared.version() + epoch * 1_000_000,
    /** Déconnexion : tout s'en va, tous les magasins. */
    clear(silent = false) {
      stores.clear();
      scope = undefined;
      current = createPostLiveStore();
      currentUid = ++uids;
      shared = createPostLiveStore();
      epoch += 1;
      attach();
      if (!silent) notify();
    },
    // --- Tickets : ils portent leur portée (`s`), la réponse s'écrit dans le magasin de cette portée. ---
    ticket: (postId: string): ScopedTicket => tagged(current.ticket(postId)),
    beginRead: (postId: string, channel: string): ScopedReadTicket => tagged(current.beginRead(postId, channel)),
    followRead: (postId: string, channel: string): ScopedReadTicket => tagged(current.followRead(postId, channel)),
    /** La réponse peut-elle encore écrire ? Dans le magasin **de son ticket** (qui existe encore, même génération). */
    alive(t: ScopedTicket): boolean {
      const store = storeOf(t);
      return store ? store.alive(t) : false;
    },
    /** Le ticket est-il celui de la casquette active ? (à tester avant tout ce qui touche l'écran : la carte, l'erreur affichée) */
    isCurrent: (t: ScopedTicket): boolean => scope !== undefined && t.s === scope && t.i === currentUid,
    fresh(t: ScopedReadTicket): boolean {
      const store = storeOf(t);
      return store ? store.fresh(t) : false;
    },
    updateSheet(postId: string, fn: Parameters<PostLiveStore["updateSheet"]>[1], t?: ScopedTicket) {
      const store = t ? storeOf(t) : current;
      return store ? store.updateSheet(postId, fn, t) : current.sheetOf(postId);
    },
    set(server: Parameters<PostLiveStore["set"]>[0], next: Parameters<PostLiveStore["set"]>[1], t?: ScopedTicket) {
      const store = t ? storeOf(t) : current;
      if (store) store.set(server, next, t);
    },
    markGone(postId: string, t?: ScopedTicket) {
      const store = t ? storeOf(t) : current;
      if (store) store.markGone(postId, t);
    },
    clearGone(t: ScopedReadTicket) {
      storeOf(t)?.clearGone(t);
    },
  };
  return new Proxy(facade, {
    get(target, key, receiver) {
      if (key in target) return Reflect.get(target, key, receiver);
      const store = SHARED_KEYS.has(key) ? shared : current;
      const value = (store as unknown as Record<PropertyKey, unknown>)[key];
      return typeof value === "function" ? value.bind(store) : value;
    },
  }) as unknown as PostLiveStore & {
    ticket: typeof facade.ticket;
    isCurrent: typeof facade.isCurrent;
  };
}
