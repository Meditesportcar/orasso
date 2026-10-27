import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  acceptCrewFeedPending,
  addCrewSignal,
  applyCrewFeedRead,
  CREW_LIVE_MAX_PAGES,
  type CrewFeedState,
  createCrewLiveBatcher,
  crewLivePillLabel,
  emptyCrewLiveNeeds,
  parseCrewSignal,
  readCrewComments,
  readCrewFeedTop,
} from "./crewLive";

const CREW = "11111111-1111-4111-8111-111111111111";
const POST = "22222222-2222-4222-8222-222222222222";
const COMMENT = "33333333-3333-4333-8333-333333333333";
const OUTING = "44444444-4444-4444-8444-444444444444";

describe("parseCrewSignal", () => {
  it("lit un signal du crew attendu, sans rien d'autre que les identifiants", () => {
    const s = parseCrewSignal(
      "comment.created",
      { type: "comment.created", crewId: CREW, postId: POST, text: "fuite", pseudo: "x" },
      CREW,
    );
    expect(s).toEqual({ type: "comment.created", crewId: CREW, postId: POST });
  });

  it("ignore un autre crew, un type inconnu, un identifiant mal formé", () => {
    expect(parseCrewSignal("post.created", { type: "post.created", crewId: POST }, CREW)).toBeNull();
    expect(parseCrewSignal("message.new", { type: "message.new", crewId: CREW }, CREW)).toBeNull();
    expect(parseCrewSignal("post.fire", { type: "post.removed", crewId: CREW }, CREW)).toBeNull();
    expect(parseCrewSignal("post.fire", { type: "post.fire", crewId: CREW, postId: "../x" }, CREW)).toEqual({
      type: "post.fire",
      crewId: CREW,
    });
  });
});

describe("addCrewSignal", () => {
  it("dit ce que la page relit pour chaque signal", () => {
    const n = emptyCrewLiveNeeds();
    addCrewSignal(n, { type: "post.fire", crewId: CREW, postId: POST });
    addCrewSignal(n, { type: "post.fire", crewId: CREW, postId: POST });
    expect(n.posts).toEqual([POST]);
    expect(n.head || n.page).toBe(false);
    addCrewSignal(n, { type: "comment.removed", crewId: CREW, postId: POST, commentId: COMMENT });
    expect(n.removedComments).toEqual([COMMENT]);
    const c = addCrewSignal(emptyCrewLiveNeeds(), { type: "crew.updated", crewId: CREW });
    expect(c.page && !c.head).toBe(true);
    const r = addCrewSignal(emptyCrewLiveNeeds(), { type: "post.removed", crewId: CREW, postId: POST });
    expect(r.removedPosts).toEqual([POST]);
  });

  it("tour 2 : les signaux d'une sortie gardent son identifiant (carte relue ou retirée, où qu'elle soit)", () => {
    const u = addCrewSignal(emptyCrewLiveNeeds(), { type: "outing.updated", crewId: CREW, outingId: OUTING });
    expect(u).toMatchObject({ outings: [OUTING], head: false, page: true });
    const r = addCrewSignal(emptyCrewLiveNeeds(), { type: "outing.rsvp", crewId: CREW, outingId: OUTING });
    expect(r).toMatchObject({ outings: [OUTING], head: false, page: true });
    const x = addCrewSignal(emptyCrewLiveNeeds(), { type: "outing.cancelled", crewId: CREW, outingId: OUTING });
    expect(x).toMatchObject({ removedOutings: [OUTING], outings: [], head: false, page: true });
    const n = addCrewSignal(emptyCrewLiveNeeds(), { type: "outing.created", crewId: CREW, outingId: OUTING });
    expect(n).toMatchObject({ head: true, page: true });
    // Sans identifiant (signal ancien) : la première page, comme avant.
    expect(addCrewSignal(emptyCrewLiveNeeds(), { type: "outing.updated", crewId: CREW }).head).toBe(true);
  });
});

describe("createCrewLiveBatcher", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("relit au plus une fois par seconde, en regroupant les signaux", async () => {
    const runs: ReturnType<typeof emptyCrewLiveNeeds>[] = [];
    const b = createCrewLiveBatcher((n) => {
      runs.push(n);
    });
    b.push({ type: "post.created", crewId: CREW });
    await vi.advanceTimersByTimeAsync(0);
    expect(runs).toHaveLength(1);
    for (let i = 0; i < 10; i += 1) b.push({ type: "post.fire", crewId: CREW, postId: POST });
    b.push({ type: "crew.updated", crewId: CREW });
    await vi.advanceTimersByTimeAsync(500);
    expect(runs).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(runs).toHaveLength(2);
    expect(runs[1]).toMatchObject({ posts: [POST], page: true, head: false });
    b.push("all");
    b.dispose();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(runs).toHaveLength(2);
  });

  it("tour 2 : pendant une relecture lente, aucun minuteur ne tourne à vide ; la suivante part après", async () => {
    let release: () => void = () => undefined;
    const runs: ReturnType<typeof emptyCrewLiveNeeds>[] = [];
    const b = createCrewLiveBatcher((n) => {
      runs.push(n);
      return new Promise<void>((resolve) => {
        release = resolve;
      });
    });
    b.push({ type: "post.created", crewId: CREW });
    await vi.advanceTimersByTimeAsync(0);
    expect(runs).toHaveLength(1);
    const timeouts = vi.spyOn(globalThis, "setTimeout");
    b.push({ type: "post.fire", crewId: CREW, postId: POST });
    await vi.advanceTimersByTimeAsync(10_000);
    // La relecture dure 10 s : un signal attend, mais rien n'est reprogrammé en boucle.
    expect(timeouts).not.toHaveBeenCalled();
    expect(runs).toHaveLength(1);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(timeouts).toHaveBeenCalledTimes(1);
    expect(runs).toHaveLength(2);
    expect(runs[1]?.posts).toEqual([POST]);
    timeouts.mockRestore();
    b.dispose();
  });

  it("tour 2 : un échec garde le besoin, retente avec un délai croissant et le dit à l'écran", async () => {
    const runs: ReturnType<typeof emptyCrewLiveNeeds>[] = [];
    const stale: boolean[] = [];
    let fail = 2;
    const b = createCrewLiveBatcher(
      (n) => {
        runs.push(n);
        if (fail > 0) {
          fail -= 1;
          throw new Error("réseau");
        }
      },
      { onStale: (s) => stale.push(s) },
    );
    b.push({ type: "post.created", crewId: CREW });
    await vi.advanceTimersByTimeAsync(0);
    expect(runs).toHaveLength(1);
    expect(stale).toEqual([true]);
    // Un signal arrivé pendant l'attente repart avec le besoin gardé.
    b.push({ type: "post.fire", crewId: CREW, postId: POST });
    await vi.advanceTimersByTimeAsync(1_900);
    expect(runs).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(runs).toHaveLength(2);
    expect(runs[1]).toMatchObject({ head: true, posts: [POST] });
    // Deuxième échec : 4 s d'attente.
    await vi.advanceTimersByTimeAsync(3_900);
    expect(runs).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(100);
    expect(runs).toHaveLength(3);
    expect(runs[2]).toMatchObject({ head: true, posts: [POST] });
    expect(stale).toEqual([true, false]);
    b.dispose();
  });
});

type Item = { key: string; at: string; type: string; n?: number; mine?: boolean };
const at = (min: number) => new Date(Date.UTC(2026, 9, 27, 10, 0) + min * 60_000).toISOString();
const post = (k: string, min: number, extra: Partial<Item> = {}): Item => ({
  key: `post:${k}`,
  at: at(min),
  type: "post",
  ...extra,
});

/** Un fil du serveur, du plus récent au plus ancien, servi par pages de `size` (curseur = position). */
function server(items: Item[], size = 20, failAt?: number) {
  const calls: (string | null)[] = [];
  const fetchPage = async (cursor: string | null) => {
    calls.push(cursor);
    const from = cursor ? Number(cursor) : 0;
    if (failAt !== undefined && from >= failAt) throw new Error("503");
    const page = items.slice(from, from + size);
    return { items: page, nextCursor: from + size < items.length ? String(from + size) : null };
  };
  return { fetchPage, calls };
}
const keys = (list: readonly { key: string }[]) => list.map((i) => i.key);

describe("applyCrewFeedRead", () => {
  const shown: Item[] = [post("a", 50, { n: 1 }), post("b", 40), post("c", 30), post("d", 20)];
  const state = { items: shown, cursor: "old" };

  it("en haut du fil : insère les nouvelles, met à jour, retire ce qui a disparu, garde les pages suivantes", () => {
    const read = { items: [post("new", 55), post("a", 50, { n: 2 }), post("c", 30)], nextCursor: "x", capped: false };
    const next = applyCrewFeedRead(state, read, { insert: true });
    expect(keys(next.items)).toEqual(["post:new", "post:a", "post:c", "post:d"]);
    expect(next.items[1]?.n).toBe(2);
    expect(next.pending).toEqual([]);
    expect(next.cursor).toBe("old");
  });

  it("loin du haut : les nouvelles attendent la pastille, le reste se met à jour sur place", () => {
    const read = { items: [post("new", 55), post("a", 50, { n: 3 }), post("b", 40)], nextCursor: "x", capped: false };
    const next = applyCrewFeedRead(state, read, { insert: false });
    expect(keys(next.items)).toEqual(["post:a", "post:b", "post:c", "post:d"]);
    expect(next.items[0]?.n).toBe(3);
    expect(keys(next.pending)).toEqual(["post:new"]);
    expect(crewLivePillLabel(next.pending)).toBe("1 nouvelle publication");
    expect(keys(acceptCrewFeedPending(next.items, next.pending))).toEqual([
      "post:new",
      "post:a",
      "post:b",
      "post:c",
      "post:d",
    ]);
  });

  it("tour 2 : une entrée plus ancienne que la plus récente affichée s'insère à sa place, sans pastille", () => {
    const read = {
      items: [post("new", 55), post("a", 50), post("old", 45), post("b", 40)],
      nextCursor: "x",
      capped: false,
    };
    const next = applyCrewFeedRead(state, read, { insert: false });
    expect(keys(next.pending)).toEqual(["post:new"]);
    expect(keys(next.items)).toEqual(["post:a", "post:old", "post:b", "post:c", "post:d"]);
  });

  it("tour 2 : ses propres publications ne vont jamais à la pastille", () => {
    const read = {
      items: [post("moi", 56, { mine: true }), post("a", 50), post("b", 40)],
      nextCursor: "x",
      capped: false,
    };
    const next = applyCrewFeedRead(state, read, { insert: false, mine: (i) => Boolean(i.mine) });
    expect(next.pending).toEqual([]);
    expect(keys(next.items)[0]).toBe("post:moi");
  });

  it("une lecture complète fait autorité sur tout le fil ; une lecture qui couvre tout prend son curseur", () => {
    const all = applyCrewFeedRead(state, { items: [post("a", 50)], nextCursor: null, capped: false }, { insert: true });
    expect(keys(all.items)).toEqual(["post:a"]);
    expect(all.cursor).toBeNull();
    const cover = applyCrewFeedRead(
      state,
      { items: [post("a", 50), post("b", 40), post("d", 20), post("e", 10)], nextCursor: "y", capped: false },
      { insert: true },
    );
    expect(keys(cover.items)).toEqual(["post:a", "post:b", "post:d", "post:e"]);
    expect(cover.cursor).toBe("y");
  });

  it("la pastille compte les publications, ou dit qu'il y a du nouveau", () => {
    expect(crewLivePillLabel([])).toBeNull();
    expect(crewLivePillLabel([{ type: "post" }, { type: "post" }, { type: "crew_outing" }])).toBe(
      "2 nouvelles publications",
    );
    expect(crewLivePillLabel([{ type: "member_joined" }])).toBe("Du nouveau dans le fil");
  });
});

describe("readCrewFeedTop (tour 2 : fusion sans perte)", () => {
  /** Un fil de `n` publications, la plus récente en premier (minutes décroissantes). */
  const feed = (prefix: string, n: number, top: number) =>
    Array.from({ length: n }, (_, i) => post(`${prefix}${i}`, top - i));

  it("plus de 20 arrivées en direct : rien ne disparaît de ce qui est déjà intégré", async () => {
    const base = feed("old", 30, 100);
    let s: CrewFeedState<Item> = { items: base.slice(0, 20), cursor: "20", pending: [] };
    let srv = base;
    // 25 publications arrivent une à une, chacune relue en haut du fil.
    for (let i = 0; i < 25; i += 1) {
      srv = [post(`new${i}`, 200 + i), ...srv];
      const { fetchPage } = server(srv);
      const read = await readCrewFeedTop(fetchPage, s.items, "head");
      s = applyCrewFeedRead(s, read, { insert: true });
    }
    expect(s.items).toHaveLength(45);
    expect(keys(s.items)[0]).toBe("post:new24");
    expect(keys(s.items).at(-1)).toBe("post:old19");
    expect(s.cursor).toBe("20");
  });

  it("après une coupure avec 25 nouveautés : les pages intermédiaires sont lues, le curseur reste juste", async () => {
    const base = feed("old", 30, 100);
    const shown = { items: base.slice(0, 20), cursor: "20" };
    const srv = [...feed("new", 25, 300), ...base];
    const { fetchPage, calls } = server(srv);
    const read = await readCrewFeedTop(fetchPage, shown.items, "head");
    expect(calls).toEqual([null, "20"]);
    const next = applyCrewFeedRead(shown, read, { insert: false });
    expect(next.pending).toHaveLength(25);
    expect(next.items).toHaveLength(20);
    const all = acceptCrewFeedPending(next.items, next.pending);
    expect(all).toHaveLength(45);
    expect(keys(all)).toEqual(keys(srv.slice(0, 45)));
    // « Voir la suite » reprend sous la plus ancienne affichée (old19), pas sous l'ancienne liste.
    expect(next.cursor).toBe("20");
    const tail = await fetchPage("45");
    expect(keys(tail.items)).toEqual(keys(base.slice(20)));
  });

  it("au-delà de la limite de pages : la lecture remplace l'affiché et son curseur prend la suite", async () => {
    const base = feed("old", 30, 1_000);
    const shown = { items: base.slice(0, 20), cursor: "20" };
    const srv = [...feed("new", 20 * CREW_LIVE_MAX_PAGES + 5, 2_000), ...base];
    const { fetchPage, calls } = server(srv);
    const read = await readCrewFeedTop(fetchPage, shown.items, "head");
    expect(calls).toHaveLength(CREW_LIVE_MAX_PAGES);
    expect(read.capped).toBe(true);
    const next = applyCrewFeedRead(shown, read, { insert: true });
    expect(next.items).toHaveLength(20 * CREW_LIVE_MAX_PAGES);
    expect(next.cursor).toBe(String(20 * CREW_LIVE_MAX_PAGES));
  });

  it("reconnexion (full) : toutes les pages chargées sont revalidées, un retrait en page 2 disparaît", async () => {
    const base = feed("p", 50, 100);
    const shown = { items: base.slice(0, 40).map((i) => ({ ...i, n: 0 })), cursor: "40" };
    // Pendant la coupure : p25 (page 2) retiré, p30 a une flamme de plus.
    const srv = base.filter((i) => i.key !== "post:p25").map((i) => (i.key === "post:p30" ? { ...i, n: 1 } : i));
    const { fetchPage, calls } = server(srv);
    const head = await readCrewFeedTop(fetchPage, shown.items, "head");
    expect(calls).toEqual([null]);
    expect(keys(applyCrewFeedRead(shown, head, { insert: true }).items)).toContain("post:p25");
    calls.length = 0;
    const full = await readCrewFeedTop(fetchPage, shown.items, "full");
    expect(calls).toEqual([null, "20"]);
    const next = applyCrewFeedRead(shown, full, { insert: true });
    expect(keys(next.items)).not.toContain("post:p25");
    expect(next.items.find((i) => i.key === "post:p30")?.n).toBe(1);
    expect(next.items.at(-1)?.key).toBe(srv[next.items.length - 1]?.key);
    // La suite reprend juste après la dernière entrée relue : rien de sauté, rien en double.
    const tail = await fetchPage(next.cursor);
    expect(keys([...next.items, ...tail.items])).toEqual(keys(srv));
  });

  it("une page en échec rejette la lecture : rien de partiel", async () => {
    const base = feed("old", 30, 100);
    const srv = [...feed("new", 25, 300), ...base];
    const { fetchPage } = server(srv, 20, 20);
    await expect(readCrewFeedTop(fetchPage, base.slice(0, 20), "head")).rejects.toThrow("503");
  });
});

describe("readCrewComments (tour 2)", () => {
  type C = { id: string; createdAt: string };
  const comments = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `c${String(i).padStart(5, "0")}`, createdAt: at(i) }));
  function pages(list: C[], failAt?: number) {
    return async (cursor: string | null) => {
      const from = cursor ? Number(cursor) : 0;
      if (failAt !== undefined && from >= failAt) throw new Error("503");
      return { items: list.slice(from, from + 50), nextCursor: from + 50 < list.length ? String(from + 50) : null };
    };
  }

  it("liste complète : relue jusqu'au bout, le nouveau à la fin", async () => {
    const list = comments(101);
    const out = await readCrewComments(pages(list), { items: list.slice(0, 100), cursor: null });
    expect(out.items).toHaveLength(101);
    expect(out.cursor).toBeNull();
  });

  it("une page intermédiaire en échec : rien n'est remplacé (la lecture rejette)", async () => {
    const list = comments(100);
    await expect(readCrewComments(pages(list, 50), { items: list, cursor: null })).rejects.toThrow("503");
  });

  it("au-delà de la limite (plus de 1 050) : le vrai curseur est gardé, jamais une troncature silencieuse", async () => {
    const list = comments(50 * CREW_LIVE_MAX_PAGES + 120);
    const out = await readCrewComments(pages(list), { items: list.slice(0, 1_100), cursor: null });
    expect(out.items).toHaveLength(50 * CREW_LIVE_MAX_PAGES);
    expect(out.cursor).toBe(String(50 * CREW_LIVE_MAX_PAGES));
  });

  it("liste partielle : relue jusqu'à la dernière affichée, avec son curseur", async () => {
    const list = comments(200);
    const shown = { items: list.slice(0, 100).filter((c) => c.id !== "c00010"), cursor: "100" };
    const out = await readCrewComments(pages(list), shown);
    expect(out.items).toHaveLength(100);
    expect(out.cursor).toBe("100");
  });
});
