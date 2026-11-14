// Lot B2b, tour 1 : les « Voir plus » des événements d'une Page : générations, réponses inversées, jamais de remise à zéro
// pour un tableau relu à l'identique.
import { describe, expect, it } from "vitest";

import { type EventsPageResult, EventsPager, type EventsPagerState, eventsPagerKey, mergeEvents } from "./eventsPager";

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
  const key = eventsPagerKey("s1", "upcoming", null, firstNext);
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

  it("une réponse arrivée après une relecture de la page (nouvelle génération) est écartée", async () => {
    const old = deferred();
    const { pager } = setup(() => old.promise);
    const slow = pager.more();
    // La page est relue : autre curseur de la suite, donc autre génération.
    pager.sync(eventsPagerKey("s1", "upcoming", null, "d1"), "d1");
    expect(pager.current).toMatchObject({ next: "d1", extra: [], busy: false });
    old.resolve({ ok: true, data: { items: ev("vieux"), nextCursor: "vieux-suite" } });
    await slow;
    expect(pager.current).toMatchObject({ next: "d1", extra: [], failed: false });
  });

  it("un échec arrivé en retard d'une ancienne génération n'affiche aucune panne", async () => {
    const old = deferred();
    const { pager } = setup(() => old.promise);
    const slow = pager.more();
    pager.sync(eventsPagerKey("s1", "upcoming", null, "d1"), "d1");
    old.resolve({ ok: false });
    await slow;
    expect(pager.current.failed).toBe(false);
  });

  it("réponses inversées : la lecture de la nouvelle génération passe devant l'ancienne", async () => {
    const first = deferred();
    const second = deferred();
    const asked: string[] = [];
    const { pager } = setup((c) => {
      asked.push(c);
      return c === "c1" ? first.promise : second.promise;
    });
    const p1 = pager.more();
    pager.sync(eventsPagerKey("s1", "upcoming", null, "d1"), "d1");
    const p2 = pager.more();
    // La nouvelle répond d'abord, puis l'ancienne, en retard.
    second.resolve({ ok: true, data: { items: ev("n1", "n2"), nextCursor: "d2" } });
    await p2;
    first.resolve({ ok: true, data: { items: ev("o1"), nextCursor: "c2" } });
    await p1;
    expect(asked).toEqual(["c1", "d1"]);
    expect(pager.current.extra.map((e) => e.id)).toEqual(["n1", "n2"]);
    expect(pager.current.next).toBe("d2");
  });

  it("une relecture identique (même clé) ne remet pas à zéro les événements ajoutés", async () => {
    const { pager } = setup(async () => ({ ok: true, data: { items: ev("a", "b"), nextCursor: "c2" } }));
    await pager.more();
    // « Suivre », « Réessayer » d'une autre section : le chargeur relit la page, tableau neuf, mêmes curseurs.
    pager.sync(eventsPagerKey("s1", "upcoming", null, "c1"), "c1");
    expect(pager.current.extra.map((e) => e.id)).toEqual(["a", "b"]);
    expect(pager.current.next).toBe("c2");
  });

  it("une autre structure, ou un autre curseur de départ, remet la liste à zéro", async () => {
    const { pager } = setup(async () => ({ ok: true, data: { items: ev("a"), nextCursor: "c2" } }));
    await pager.more();
    pager.sync(eventsPagerKey("s2", "upcoming", null, "c1"), "c1");
    expect(pager.current.extra).toEqual([]);
    await pager.more();
    pager.sync(eventsPagerKey("s2", "upcoming", "x9", "c1"), "c1");
    expect(pager.current.extra).toEqual([]);
  });
});
