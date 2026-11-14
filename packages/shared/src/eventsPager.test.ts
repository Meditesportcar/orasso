// Lot B2b, tour 1 : les « Voir plus » des événements d'une Page : générations, réponses inversées, jamais de remise à zéro
// pour un tableau relu à l'identique.
import { describe, expect, it, vi } from "vitest";

import {
  type EventsPageResult,
  EventsPager,
  type EventsPagerState,
  eventsPagerKey,
  type KeptFirstPage,
  keepFirstPage,
  mergeEvents,
} from "./eventsPager";

type E = { id: string };
const ev = (...ids: string[]): E[] => ids.map((id) => ({ id }));

/** Une réponse rendue à la main : permet d'ordonner les réponses. */
function deferred() {
  let resolve!: (r: EventsPageResult<E>) => void;
  const promise = new Promise<EventsPageResult<E>>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function setup(fetchPage: (cursor: string) => Promise<EventsPageResult<E>>, firstNext: string | null = "c1") {
  const seen: EventsPagerState<E>[] = [];
  const key = eventsPagerKey("s1", "upcoming", null);
  const pager = new EventsPager<E>(fetchPage, (s) => seen.push(s), key, firstNext);
  return { pager, seen, key };
}

describe("événements d'une Page : « Voir plus »", () => {
  it("ajoute la page suivante et avance le curseur ; plus de curseur : plus de « Voir plus »", async () => {
    const { pager } = setup(async (c) => ({
      ok: true,
      data: c === "c1" ? { items: ev("a", "b"), nextCursor: "c2" } : { items: ev("c"), nextCursor: null },
    }));
    await pager.more();
    expect(pager.current).toMatchObject({ next: "c2", failed: false, busy: false });
    await pager.more();
    expect(pager.current.extra.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(pager.current.next).toBeNull();
    await pager.more();
    expect(pager.current.extra).toHaveLength(3);
  });

  it("n'ajoute jamais deux fois le même événement", async () => {
    const { pager } = setup(async (c) => ({
      ok: true,
      data: c === "c1" ? { items: ev("a", "b"), nextCursor: "c2" } : { items: ev("b", "c"), nextCursor: null },
    }));
    await pager.more();
    await pager.more();
    expect(pager.current.extra.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(mergeEvents(ev("a", "z"), ev("z", "b")).map((e) => e.id)).toEqual(["a", "z", "b"]);
  });

  it("un échec se dit, garde ce qui est affiché, et « Réessayer » relit la même suite", async () => {
    let fail = true;
    const asked: string[] = [];
    const { pager } = setup(async (c) => {
      asked.push(c);
      return fail ? { ok: false } : { ok: true, data: { items: ev("a"), nextCursor: null } };
    });
    await pager.more();
    expect(pager.current).toMatchObject({ failed: true, busy: false, next: "c1", extra: [] });
    fail = false;
    await pager.more();
    expect(pager.current).toMatchObject({ failed: false, next: null });
    expect(pager.current.extra.map((e) => e.id)).toEqual(["a"]);
    expect(asked).toEqual(["c1", "c1"]);
  });

  it("une exception réseau est un échec, pas un plantage", async () => {
    const { pager } = setup(async () => {
      throw new Error("réseau");
    });
    await pager.more();
    expect(pager.current).toMatchObject({ failed: true, busy: false });
  });

  it("un deuxième geste pendant la lecture ne relance rien", async () => {
    const d = deferred();
    let calls = 0;
    const { pager } = setup(() => {
      calls++;
      return d.promise;
    });
    const a = pager.more();
    const b = pager.more();
    d.resolve({ ok: true, data: { items: ev("a"), nextCursor: null } });
    await Promise.all([a, b]);
    expect(calls).toBe(1);
  });

  it("une réponse arrivée après une relecture de la page (même curseur) est écartée", async () => {
    const old = deferred();
    const { pager, key } = setup(() => old.promise);
    const slow = pager.more();
    // La page est relue, curseur suivant inchangé : nouvelle génération quand même.
    pager.sync(key, "c1");
    expect(pager.current).toMatchObject({ next: "c1", extra: [], busy: false });
    old.resolve({ ok: true, data: { items: ev("vieux"), nextCursor: "vieux-suite" } });
    await slow;
    expect(pager.current).toMatchObject({ next: "c1", extra: [], failed: false });
  });

  it("un échec arrivé en retard d'une ancienne génération n'affiche aucune panne", async () => {
    const old = deferred();
    const { pager, key } = setup(() => old.promise);
    const slow = pager.more();
    pager.sync(key, "c1");
    old.resolve({ ok: false });
    await slow;
    expect(pager.current.failed).toBe(false);
  });

  it("réponses inversées : la lecture de la nouvelle génération passe devant l'ancienne", async () => {
    const first = deferred();
    const second = deferred();
    const asked: string[] = [];
    const { pager, key } = setup((c) => {
      asked.push(c);
      return c === "c1" ? first.promise : second.promise;
    });
    const p1 = pager.more();
    pager.sync(key, "d1");
    const p2 = pager.more();
    second.resolve({ ok: true, data: { items: ev("n1", "n2"), nextCursor: "d2" } });
    await p2;
    first.resolve({ ok: true, data: { items: ev("o1"), nextCursor: "c2" } });
    await p1;
    expect(asked).toEqual(["c1", "d1"]);
    expect(pager.current.extra.map((e) => e.id)).toEqual(["n1", "n2"]);
    expect(pager.current.next).toBe("d2");
  });

  /** Un serveur : une suite de pages chaînées par curseur, modifiable entre deux lectures. */
  function chain(pages: Record<string, { items: E[]; next: string | null }>) {
    return async (c: string): Promise<EventsPageResult<E>> => {
      const p = pages[c];
      return p ? { ok: true, data: { items: p.items, nextCursor: p.next } } : { ok: false };
    };
  }

  it("pendant la relecture en arrière-plan l'ancienne liste reste affichée (et intacte si elle échoue)", async () => {
    const pages: Record<string, { items: E[]; next: string | null }> = {
      c1: { items: ev("a", "b"), next: "c2" },
      c2: { items: ev("c", "d"), next: null },
    };
    const gate = deferred();
    let hold = false;
    const read = chain(pages);
    const { pager, key } = setup(async (c) => {
      if (hold) return gate.promise;
      return read(c);
    });
    await pager.more();
    await pager.more();
    expect(pager.current.extra.map((e) => e.id)).toEqual(["a", "b", "c", "d"]);
    // « b » est annulé ; la page est relue, même curseur suivant « c1 ».
    pages.c1 = { items: ev("a"), next: "c2" };
    hold = true;
    pager.sync(key, "c1");
    expect(pager.current.busy).toBe(true);
    expect(pager.current.extra.map((e) => e.id)).toEqual(["a", "b", "c", "d"]);
    hold = false;
    gate.resolve({ ok: false });
    await vi.waitFor(() => expect(pager.current.busy).toBe(false));
    // La lecture a échoué : rien n'a bougé, « Voir plus » reste possible, aucun message.
    expect(pager.current.extra.map((e) => e.id)).toEqual(["a", "b", "c", "d"]);
    expect(pager.current).toMatchObject({ pages: 2, failed: false, next: null });
  });

  it("relecture identique réussie : la liste et le curseur sont inchangés à la fin", async () => {
    const pages: Record<string, { items: E[]; next: string | null }> = {
      c1: { items: ev("a", "b"), next: "c2" },
      c2: { items: ev("c", "d"), next: null },
    };
    const { pager, key } = setup(chain(pages));
    await pager.more();
    await pager.more();
    pager.sync(key, "c1");
    await vi.waitFor(() => expect(pager.current.busy).toBe(false));
    expect(pager.current.extra.map((e) => e.id)).toEqual(["a", "b", "c", "d"]);
    expect(pager.current).toMatchObject({ next: null, pages: 2, failed: false });
  });

  it("un vrai échec après une première page relue avec succès : liste, curseur et profondeur intacts", async () => {
    const pages: Record<string, { items: E[]; next: string | null }> = {
      c1: { items: ev("a"), next: "c2" },
      c2: { items: ev("b"), next: "c3" },
      c3: { items: ev("c"), next: null },
    };
    const asked: string[] = [];
    const read = chain(pages);
    const { pager, key } = setup(async (c) => {
      asked.push(c);
      return c === "d2" ? { ok: false } : read(c);
    });
    await pager.more();
    await pager.more();
    await pager.more();
    // La relecture réussit sur « d1 » (page 1) puis échoue sur « d2 » (page 2) : rien n'est remplacé.
    pages.d1 = { items: ev("z"), next: "d2" };
    asked.length = 0;
    pager.sync(key, "d1");
    await vi.waitFor(() => expect(pager.current.busy).toBe(false));
    expect(asked).toEqual(["d1", "d2"]);
    expect(pager.current.extra.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(pager.current).toMatchObject({ next: null, pages: 3, failed: false });
  });

  it("la lecture de la première page en panne ne remet rien à zéro (même clé) ; une autre clé, si", async () => {
    const { pager, key } = setup(async () => ({ ok: true, data: { items: ev("a"), nextCursor: "c2" } }));
    await pager.more();
    pager.onRead(key, null, false);
    expect(pager.current.extra.map((e) => e.id)).toEqual(["a"]);
    expect(pager.current.next).toBe("c2");
    pager.onRead(eventsPagerKey("s2", "upcoming", null), null, false);
    expect(pager.current.extra).toEqual([]);
  });

  it("l'expiration du délai (lecture rejetée) garde la liste et réactive le bouton, à « Voir plus » comme à la relecture", async () => {
    let timeout = false;
    const { pager, key } = setup(async () => {
      if (timeout) throw new DOMException("délai dépassé", "TimeoutError");
      return { ok: true, data: { items: ev("a"), nextCursor: "c2" } };
    });
    await pager.more();
    timeout = true;
    await pager.more();
    expect(pager.current).toMatchObject({ busy: false, failed: true, pages: 1 });
    expect(pager.current.extra.map((e) => e.id)).toEqual(["a"]);
    pager.sync(key, "c1");
    await vi.waitFor(() => expect(pager.current.busy).toBe(false));
    expect(pager.current.extra.map((e) => e.id)).toEqual(["a"]);
    expect(pager.current.next).toBe("c2");
  });

  it("événement annulé en 2e page : remplacé d'un coup après la relecture", async () => {
    const pages: Record<string, { items: E[]; next: string | null }> = {
      c1: { items: ev("a", "b"), next: "c2" },
      c2: { items: ev("c", "d"), next: null },
    };
    const { pager, key } = setup(chain(pages));
    await pager.more();
    await pager.more();
    pages.c1 = { items: ev("a"), next: "c2" };
    pages.c2 = { items: ev("c"), next: null };
    pager.sync(key, "c1");
    await vi.waitFor(() => expect(pager.current.busy).toBe(false));
    expect(pager.current.extra.map((e) => e.id)).toEqual(["a", "c"]);
    expect(pager.current.pages).toBe(2);
  });

  it("frontière de la 1re page déplacée : rien n'est effacé, la liste est à jour après la relecture", async () => {
    const pages: Record<string, { items: E[]; next: string | null }> = {
      c1: { items: ev("e2", "e3"), next: "c2" },
      c2: { items: ev("e4", "e5"), next: "c3" },
      c3: { items: ev("e6"), next: null },
    };
    const { pager, key } = setup(chain(pages));
    await pager.more();
    await pager.more();
    await pager.more();
    expect(pager.current.extra.map((e) => e.id)).toEqual(["e2", "e3", "e4", "e5", "e6"]);
    // L'événement e1 (de la 1re page) est annulé : la frontière passe de « c1 » à « d1 » (la suite démarre un cran plus loin).
    pages.d1 = { items: ev("e3", "e4"), next: "d2" };
    pages.d2 = { items: ev("e5", "e6"), next: "d3" };
    pages.d3 = { items: ev("e7"), next: null };
    pager.sync(key, "d1");
    await vi.waitFor(() => expect(pager.current.busy).toBe(false));
    expect(pager.current.extra.map((e) => e.id)).toEqual(["e3", "e4", "e5", "e6", "e7"]);
    expect(pager.current.next).toBeNull();
  });

  it("une relecture qui échoue laisse l'ancienne liste et « Voir plus » disponible, sans message", async () => {
    const pages: Record<string, { items: E[]; next: string | null }> = {
      c1: { items: ev("a"), next: "c2" },
      c2: { items: ev("b"), next: "c3" },
    };
    const { pager, key } = setup(chain(pages));
    await pager.more();
    await pager.more();
    pager.sync(key, "zz");
    await vi.waitFor(() => expect(pager.current.busy).toBe(false));
    expect(pager.current).toMatchObject({ failed: false, next: "c3", pages: 2 });
    expect(pager.current.extra.map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("la relecture ne dépasse pas dix pages", async () => {
    const asked: string[] = [];
    const { pager, key } = setup(async (c) => {
      asked.push(c);
      const n = Number(c.slice(1));
      return { ok: true, data: { items: ev(`x${n}`), nextCursor: `c${n + 1}` } };
    });
    for (let i = 0; i < 12; i++) await pager.more();
    expect(pager.current.pages).toBe(12);
    asked.length = 0;
    pager.sync(key, "c1");
    await vi.waitFor(() => expect(pager.current.busy).toBe(false));
    expect(asked).toHaveLength(10);
    expect(pager.current.pages).toBe(10);
  });

  it("une autre structure, une autre liste ou un autre curseur de départ remet la liste à zéro", async () => {
    const { pager } = setup(async () => ({ ok: true, data: { items: ev("a"), nextCursor: "c2" } }));
    await pager.more();
    pager.sync(eventsPagerKey("s2", "upcoming", null), "c1");
    expect(pager.current.extra).toEqual([]);
    await pager.more();
    pager.sync(eventsPagerKey("s2", "past", null), "c1");
    expect(pager.current.extra).toEqual([]);
    await pager.more();
    pager.sync(eventsPagerKey("s2", "past", "x9"), "c1");
    expect(pager.current.extra).toEqual([]);
  });

  // Lot B2b, tour 3 : ce que le crochet du site montre (première page gardée + pages ajoutées), sans React.
  describe("écran : une relecture de la page en panne garde la liste", () => {
    function screen(
      pages: Record<string, { items: E[]; next: string | null }>,
      firstItems: E[],
      firstNext: string | null,
    ) {
      const key = eventsPagerKey("s1", "upcoming", null);
      let kept: KeptFirstPage<E> | null = null;
      const pager = new EventsPager<E>(chain(pages), () => undefined, key, firstNext);
      const show = (first: E[] | null, next: string | null) => {
        const view = keepFirstPage(kept, key, first, next);
        kept = view.kept;
        const cur = pager.current;
        return {
          ids: view.items === null ? null : mergeEvents(view.items, cur.extra).map((e) => e.id),
          next: view.items === null ? null : cur.pages === 0 ? view.next : cur.next,
          readFailed: view.readFailed,
        };
      };
      return { pager, key, show, firstItems, firstNext };
    }
    const pages = (): Record<string, { items: E[]; next: string | null }> => ({
      c1: { items: ev("c", "d"), next: "c2" },
      c2: { items: ev("e"), next: null },
    });

    it("chargement, « Voir plus », relecture en 503 : la liste reste affichée et la panne se dit ; reprise : liste à jour", async () => {
      const server = pages();
      const { pager, key, show } = screen(server, ev("a", "b"), "c1");
      expect(show(ev("a", "b"), "c1")).toEqual({ ids: ["a", "b"], next: "c1", readFailed: false });
      await pager.more();
      await pager.more();
      expect(show(ev("a", "b"), "c1")).toMatchObject({ ids: ["a", "b", "c", "d", "e"], next: null });
      // Le chargeur relit la page et l'API répond 503 : `first` est nul.
      pager.onRead(key, null, false);
      expect(show(null, null)).toEqual({ ids: ["a", "b", "c", "d", "e"], next: null, readFailed: true });
      // Reprise : un événement de la 2e page est annulé, la liste est à jour.
      server.c1 = { items: ev("c"), next: "c2" };
      pager.onRead(key, "c1", true);
      await vi.waitFor(() => expect(pager.current.busy).toBe(false));
      expect(show(ev("a", "b"), "c1")).toEqual({ ids: ["a", "b", "c", "e"], next: null, readFailed: false });
    });

    it("« Voir plus » reste utilisable pendant la panne et son résultat est visible", async () => {
      const { pager, key, show } = screen(pages(), ev("a", "b"), "c1");
      show(ev("a", "b"), "c1");
      await pager.more();
      pager.onRead(key, null, false);
      expect(show(null, null)).toMatchObject({ ids: ["a", "b", "c", "d"], next: "c2", readFailed: true });
      await pager.more();
      expect(show(null, null)).toMatchObject({ ids: ["a", "b", "c", "d", "e"], next: null, readFailed: true });
    });

    it("une première lecture en panne (rien de gardé pour cette clé) ne montre rien : la panne remplace la liste", () => {
      const { show } = screen(pages(), ev("a"), null);
      expect(show(null, null)).toEqual({ ids: null, next: null, readFailed: false });
    });

    it("une autre clé ne reprend pas la première page gardée d'une autre liste", () => {
      const kept: KeptFirstPage<E> = { key: "autre", items: ev("x"), next: null };
      expect(keepFirstPage(kept, "s1|upcoming|", null, null)).toMatchObject({ items: null, readFailed: false });
    });
  });
});
