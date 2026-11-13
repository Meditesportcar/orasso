// Un magasin de commentaires par compte **et** par casquette, conservés au changement de casquette (R9n, tours 2 et 3) : voir le modèle
// en tête de `scope.ts`. La façade a la forme d'un `PostLiveStore` : `postLive.xxx` agit sur le magasin de la casquette active, sauf
// les écritures portées par un ticket (elles vont au magasin du ticket) et l'état d'écran commun (`opening`, `hosts`).
import {
  createPostLiveStore,
  emptySheet,
  type FeedPostView,
  type LiveTicket,
  type PostLiveStore,
  type ReadTicket,
} from "@orasso/shared";

/** Le compte d'une portée `compte|acteur` (`commentsScope`). */
const accountOf = (scope: string): string => scope.split("|")[0] ?? scope;

/** Un ticket porte sa portée (`s`) et l'identité du magasin qui l'a émis (`i`) : un magasin recréé (déconnexion, autre compte, même portée) ne reconnaît pas les tickets d'avant. */
export type ScopedTicket = LiveTicket & { s: string | null; i: number; b?: FeedPostView | null };
export type ScopedReadTicket = ReadTicket & { s: string | null; i: number };

const SHARED_KEYS = new Set<PropertyKey>(["opening", "open", "close", "register", "setFocused", "host"]);

export function createPostLiveSet() {
  const stores = new Map<string, { store: PostLiveStore; uid: number }>();
  let uids = 0;
  let currentUid = 0;
  /** L'état d'écran commun à toutes les casquettes du compte : la feuille ouverte et les hôtes montés. */
  const shared = createPostLiveStore();
  const listeners = new Set<() => void>();
  /** La publication telle que l'API l'a rendue, par portée : base de la modification d'une carte écrite pour une casquette qui n'est plus active (C3). */
  const servers = new Map<string, Map<string, FeedPostView>>();
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
  /** Ferme la feuille ; `silent` : sans prévenir (appel pendant le rendu, `live.ts`), elle se lit fermée au rendu suivant (la version a changé). */
  const closeShared = (silent: boolean) => {
    if (silent) {
      for (const o of offs) o();
      shared.close();
      attach();
    } else shared.close();
  };
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
        servers.clear();
        current = createPostLiveStore();
        currentUid = ++uids;
        closeShared(silent);
      } else {
        if (previous && accountOf(previous) !== accountOf(next)) {
          stores.clear();
          servers.clear();
          closeShared(silent);
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
      servers.clear();
      scope = undefined;
      current = createPostLiveStore();
      currentUid = ++uids;
      closeShared(silent);
      epoch += 1;
      attach();
      if (!silent) notify();
    },
    // --- Tickets : ils portent leur portée (`s`), la réponse s'écrit dans le magasin de cette portée. ---
    /** Le ticket garde la publication telle que l'API l'avait rendue au geste (`b`) : base pour savoir si la carte a été relue depuis. */
    ticket: (postId: string): ScopedTicket => ({
      ...tagged(current.ticket(postId)),
      b: scope ? (servers.get(scope)?.get(postId) ?? null) : null,
    }),
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
      // Magasin du ticket absent (compte quitté) : rien n'est écrit, et jamais le fil de la casquette active n'est rendu à sa place.
      return store ? store.updateSheet(postId, fn, t) : emptySheet();
    },
    set(server: Parameters<PostLiveStore["set"]>[0], next: Parameters<PostLiveStore["set"]>[1], t?: ScopedTicket) {
      const store = t ? storeOf(t) : current;
      if (store) store.set(server, next, t);
    },
    markGone(postId: string, t?: ScopedTicket) {
      const store = t ? storeOf(t) : current;
      if (!store) return;
      const wasGone = store.isGone(postId);
      store.markGone(postId, t);
      // La feuille ouverte est un état d'écran commun : elle se ferme quand la publication vient de passer à « disparue » (404 de la casquette
      // active, ou sans ticket), jamais pour un ticket périmé refusé ni pour la réponse tardive d'une autre casquette.
      if ((!t || t.s === scope) && !wasGone && store.isGone(postId) && shared.opening()?.postId === postId)
        shared.close();
    },
    /** Le fil d'un ticket : l'état à lire pour calculer une écriture vers ce même magasin (R2). Sans ticket : la casquette active. */
    sheetOf(postId: string, t?: ScopedTicket) {
      const store = t ? storeOf(t) : current;
      return store ? store.sheetOf(postId) : emptySheet();
    },
    /** Rend périmées les lectures en cours d'un fil dans le magasin du ticket (un parent disparu). */
    /** La publication affichée pour la casquette active : on retient ce que l'API a rendu, pour pouvoir modifier la carte d'une autre casquette. */
    apply(server: FeedPostView): FeedPostView {
      if (scope) {
        let map = servers.get(scope);
        if (!map) {
          map = new Map();
          servers.set(scope, map);
        }
        map.set(server.id, server);
      }
      return current.apply(server);
    },
    /**
     * C3 : la modification d'une carte (`commentsOff`, compteurs, aperçus) pour une casquette qui n'est plus active : calculée depuis
     * **ses** données (l'API + ses modifications) et écrite dans **son** magasin ; elle la retrouve à son retour.
     */
    changePost(
      postId: string,
      t: ScopedTicket,
      fn: (post: FeedPostView, ctx: { stale: boolean }) => FeedPostView,
    ): FeedPostView | null {
      const store = storeOf(t);
      const server = t.s ? servers.get(t.s)?.get(postId) : undefined;
      if (!store || !server) return null;
      // Carte relue pendant la mutation (le compteur du serveur n'est plus celui du geste) : il inclut déjà le changement, on n'ajoute pas
      // `+1`/`-1` une seconde fois (tour 5, Codex 3).
      const stale = Boolean(t.b) && t.b !== server && t.b?.commentsCount !== server.commentsCount;
      const next = fn(store.apply(server), { stale });
      store.set(server, next, t);
      return next;
    },
    dropReads(postId: string, channel: string, t: ScopedTicket) {
      storeOf(t)?.beginRead(postId, channel);
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
  }) as unknown as Omit<PostLiveStore, "sheetOf" | "ticket" | "apply"> & {
    ticket: typeof facade.ticket;
    isCurrent: typeof facade.isCurrent;
    sheetOf: typeof facade.sheetOf;
    dropReads: typeof facade.dropReads;
    changePost: typeof facade.changePost;
    apply: typeof facade.apply;
  };
}

export type PostLiveSet = ReturnType<typeof createPostLiveSet>;
