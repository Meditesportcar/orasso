import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addCrewSignal,
  createCrewLiveBatcher,
  crewLivePillLabel,
  emptyCrewLiveNeeds,
  mergeCrewFeedHead,
  parseCrewSignal,
} from "./crewLive";

const CREW = "11111111-1111-4111-8111-111111111111";
const POST = "22222222-2222-4222-8222-222222222222";
const COMMENT = "33333333-3333-4333-8333-333333333333";

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
    addCrewSignal(n, { type: "outing.rsvp", crewId: CREW, outingId: POST });
    expect(n.head && n.page).toBe(true);
    const c = addCrewSignal(emptyCrewLiveNeeds(), { type: "crew.updated", crewId: CREW });
    expect(c.page && !c.head).toBe(true);
    const r = addCrewSignal(emptyCrewLiveNeeds(), { type: "post.removed", crewId: CREW, postId: POST });
    expect(r.removedPosts).toEqual([POST]);
  });
});

describe("createCrewLiveBatcher", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("relit au plus une fois par seconde, en regroupant les signaux", async () => {
    const runs: ReturnType<typeof emptyCrewLiveNeeds>[] = [];
    const b = createCrewLiveBatcher((n) => {
      runs.push(n);
    }, 1_000);
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
});

type Item = { key: string; at: string; type: string; n?: number };
const at = (min: number) => new Date(Date.UTC(2026, 9, 27, 10, min)).toISOString();

describe("mergeCrewFeedHead", () => {
  const current: Item[] = [
    { key: "post:a", at: at(50), type: "post", n: 1 },
    { key: "post:b", at: at(40), type: "post" },
    { key: "post:c", at: at(30), type: "post" },
    { key: "post:d", at: at(20), type: "post" },
  ];

  it("en haut du fil : insère les nouvelles, met à jour, retire ce qui a disparu, garde les pages suivantes", () => {
    const head: Item[] = [
      { key: "post:new", at: at(55), type: "post" },
      { key: "post:a", at: at(50), type: "post", n: 2 },
      { key: "post:c", at: at(30), type: "post" },
    ];
    const { items, fresh } = mergeCrewFeedHead(current, head, { complete: false, insert: true });
    expect(items.map((i) => i.key)).toEqual(["post:new", "post:a", "post:c", "post:d"]);
    expect(items[1]?.n).toBe(2);
    expect(fresh).toEqual([]);
  });

  it("loin du haut : les nouvelles attendent la pastille, le reste se met à jour sur place", () => {
    const head: Item[] = [
      { key: "post:new", at: at(55), type: "post" },
      { key: "post:a", at: at(50), type: "post", n: 3 },
      { key: "post:b", at: at(40), type: "post" },
    ];
    const { items, fresh } = mergeCrewFeedHead(current, head, { complete: false, insert: false });
    expect(items.map((i) => i.key)).toEqual(["post:a", "post:b", "post:c", "post:d"]);
    expect(items[0]?.n).toBe(3);
    expect(fresh.map((i) => i.key)).toEqual(["post:new"]);
    expect(crewLivePillLabel(fresh)).toBe("1 nouvelle publication");
  });

  it("une première page complète fait autorité sur tout le fil", () => {
    const head: Item[] = [{ key: "post:a", at: at(50), type: "post" }];
    const { items } = mergeCrewFeedHead(current, head, { complete: true, insert: true });
    expect(items.map((i) => i.key)).toEqual(["post:a"]);
  });

  it("la pastille compte les publications, ou dit qu'il y a du nouveau", () => {
    expect(crewLivePillLabel([])).toBeNull();
    expect(crewLivePillLabel([{ type: "post" }, { type: "post" }, { type: "crew_outing" }])).toBe(
      "2 nouvelles publications",
    );
    expect(crewLivePillLabel([{ type: "member_joined" }])).toBe("Du nouveau dans le fil");
  });
});
