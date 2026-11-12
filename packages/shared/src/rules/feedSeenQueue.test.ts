// Lot R8c2 : ce que l'écran du Fil suit (présence d'une seconde), la file des cartes vues (lots de 50, remise en file, jamais
// « Sponsorisé »), la place de « Tu es à jour » à partir d'une page réelle, et la copie hors ligne.
import { describe, expect, it } from "vitest";

import type { FeedCard } from "../schemas/feed";
import {
  appendCards,
  applyFeedPage,
  caughtUpIndex,
  createSeenDwell,
  createSeenQueue,
  emptyFeedList,
  FEED_COPY_MAX,
  feedCopyCards,
  feedCopyKey,
  isSeenCardId,
  isVisibleEnough,
  parseFeedCopy,
  SEEN_RETRY_BASE_MS,
  type SeenEntry,
  type SeenSendResult,
  withMyPublished,
} from "./feedList";

const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const id = (i: number, kind = "feed_post") => `${kind}:${uuid(i)}`;
const card = (i: number, over: Partial<FeedCard> = {}): FeedCard =>
  ({
    id: id(i),
    kind: "feed_post",
    reason: { code: "near_you", label: "Autour de toi" },
    at: "2026-11-09T10:00:00.000Z",
    payload: { post: { id: uuid(i) } },
    seen: false,
    ...over,
  }) as unknown as FeedCard;

describe("isSeenCardId : seuls les identifiants que l'API retient", () => {
  it("genre:uuid, jamais sponsored, jamais une forme inconnue (l'API refuse tout le lot sinon)", () => {
    expect(isSeenCardId(id(1))).toBe(true);
    expect(isSeenCardId(id(2, "event_recommended"))).toBe(true);
    expect(isSeenCardId(id(3, "sponsored"))).toBe(false);
    expect(isSeenCardId("memory:2026-11-09")).toBe(false);
    expect(isSeenCardId(uuid(4))).toBe(false);
    expect(isSeenCardId("")).toBe(false);
  });
});

describe("isVisibleEnough : la moitié de la carte, ou de la zone pour une carte plus haute", () => {
  it("carte entière, à moitié, à moins de la moitié", () => {
    expect(isVisibleEnough(100, 300, 0, 800)).toBe(true);
    expect(isVisibleEnough(-150, 300, 0, 800)).toBe(true); // moitié sortie en haut : pile 50 %
    expect(isVisibleEnough(-151, 300, 0, 800)).toBe(false);
    expect(isVisibleEnough(650, 300, 0, 800)).toBe(true); // 150 px dans la zone
    expect(isVisibleEnough(651, 300, 0, 800)).toBe(false);
  });
  it("une carte plus haute que la zone compte quand la moitié de la zone est couverte", () => {
    expect(isVisibleEnough(-300, 1500, 0, 800)).toBe(true);
    expect(isVisibleEnough(500, 1500, 0, 800)).toBe(false);
  });
  it("hauteur ou zone nulle : jamais", () => {
    expect(isVisibleEnough(0, 0, 0, 800)).toBe(false);
    expect(isVisibleEnough(0, 100, 500, 500)).toBe(false);
  });
});

describe("createSeenDwell : une seconde d'affilée", () => {
  it("annonce la carte à la seconde, une seule fois", () => {
    const dwell = createSeenDwell();
    expect(dwell.observe(["a"], 0)).toEqual([]);
    expect(dwell.observe(["a"], 999)).toEqual([]);
    expect(dwell.observe(["a"], 1000)).toEqual(["a"]);
    expect(dwell.observe(["a"], 5000)).toEqual([]);
  });
  it("une carte qui sort de la vue repart de zéro", () => {
    const dwell = createSeenDwell();
    dwell.observe(["a", "b"], 0);
    dwell.observe(["b"], 600); // « a » sort
    expect(dwell.observe(["a", "b"], 1000)).toEqual(["b"]); // « a » recommence à 1000
    expect(dwell.observe(["a"], 1900)).toEqual([]);
    expect(dwell.observe(["a"], 2000)).toEqual(["a"]);
  });
  it("reset : tout repart (autre onglet, actualisation)", () => {
    const dwell = createSeenDwell();
    dwell.observe(["a"], 0);
    dwell.observe(["a"], 1000);
    dwell.reset();
    expect(dwell.observe(["a"], 2000)).toEqual([]);
    expect(dwell.observe(["a"], 3000)).toEqual(["a"]);
  });
});

describe("createSeenQueue : la file des cartes vues", () => {
  function setup(results: SeenSendResult[] = []) {
    const sent: SeenEntry[][] = [];
    const clock = { t: Date.parse("2026-11-11T10:00:00.000Z") };
    const queue = createSeenQueue({
      now: () => clock.t,
      send: async (batch) => {
        sent.push(batch);
        return results.shift() ?? "ok";
      },
    });
    return { queue, sent, clock };
  }

  it("dédoublonne : une carte part une fois, avec la plus forte action", async () => {
    const { queue, sent } = setup();
    queue.add(id(1), "view");
    queue.add(id(1), "open");
    queue.add(id(1), "view");
    queue.add(id(2), "view");
    expect(queue.size()).toBe(2);
    expect(await queue.flush()).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.map((e) => [e.id, e.action])).toEqual([
      [id(1), "open"],
      [id(2), "view"],
    ]);
    expect(queue.size()).toBe(0);
  });

  it("jamais une carte « Sponsorisé », ni un identifiant inconnu", async () => {
    const { queue, sent } = setup();
    queue.add(id(1, "sponsored"), "view");
    queue.add("memory:2026-11-09", "view");
    expect(queue.size()).toBe(0);
    expect(await queue.flush()).toBe(true);
    expect(sent).toHaveLength(0);
  });

  it("par lots de 50 : 120 cartes = 3 envois", async () => {
    const { queue, sent } = setup();
    for (let i = 1; i <= 120; i++) queue.add(id(i), "view");
    expect(await queue.flush()).toBe(true);
    expect(sent.map((b) => b.length)).toEqual([50, 50, 20]);
  });

  it("200 au plus : les plus récentes restent", async () => {
    const { queue } = setup();
    for (let i = 1; i <= 260; i++) queue.add(id(i), "view");
    expect(queue.size()).toBe(200);
    expect(queue.snapshot()[0]?.id).toBe(id(61));
  });

  it("un échec remet le lot en file, sans perte, et repousse l'essai (pas de boucle serrée)", async () => {
    const { queue, sent, clock } = setup(["retry"]);
    for (let i = 1; i <= 60; i++) queue.add(id(i), "view");
    expect(await queue.flush()).toBe(false);
    expect(sent).toHaveLength(1);
    expect(queue.size()).toBe(60);
    // Dans le délai : aucun envoi.
    expect(await queue.flush()).toBe(false);
    expect(sent).toHaveLength(1);
    clock.t += SEEN_RETRY_BASE_MS;
    expect(await queue.flush()).toBe(true);
    expect(sent.map((b) => b.length)).toEqual([50, 50, 10]);
    expect(queue.size()).toBe(0);
  });

  it("le délai double à chaque échec de suite, puis revient à zéro après un envoi réussi", async () => {
    const { queue, sent, clock } = setup(["retry", "retry", "ok"]);
    queue.add(id(1), "view");
    await queue.flush();
    clock.t += SEEN_RETRY_BASE_MS;
    await queue.flush(); // 2e échec : prochain essai dans 120 s
    clock.t += SEEN_RETRY_BASE_MS;
    expect(await queue.flush()).toBe(false);
    expect(sent).toHaveLength(2);
    clock.t += SEEN_RETRY_BASE_MS;
    expect(await queue.flush()).toBe(true);
    expect(sent).toHaveLength(3);
  });

  it("une erreur lancée par l'envoi compte comme un échec ; un refus définitif (400) abandonne le lot", async () => {
    const clock = { t: Date.parse("2026-11-11T10:00:00.000Z") };
    let mode: "throw" | "drop" = "throw";
    const queue = createSeenQueue({
      now: () => clock.t,
      send: async () => {
        if (mode === "throw") throw new Error("réseau");
        return "drop";
      },
    });
    queue.add(id(1), "view");
    expect(await queue.flush()).toBe(false);
    expect(queue.size()).toBe(1);
    clock.t += SEEN_RETRY_BASE_MS;
    mode = "drop";
    expect(await queue.flush()).toBe(true);
    expect(queue.size()).toBe(0);
  });

  it("une carte vue pendant un envoi reste en file", async () => {
    const clock = { t: Date.parse("2026-11-11T10:00:00.000Z") };
    const batches: string[][] = [];
    let queue!: ReturnType<typeof createSeenQueue>;
    queue = createSeenQueue({
      now: () => clock.t,
      send: async (batch) => {
        batches.push(batch.map((e) => e.id));
        if (batches.length === 1) queue.add(id(9), "view");
        return "ok";
      },
    });
    queue.add(id(1), "view");
    expect(await queue.flush()).toBe(true);
    // Le second tour de la boucle envoie la carte arrivée pendant le premier envoi : rien n'est perdu.
    expect(batches).toEqual([[id(1)], [id(9)]]);
    expect(queue.size()).toBe(0);
  });

  it("hors ligne : rien ne part de plus de 24 h ; l'heure `at` est posée à la vue", async () => {
    const { queue, sent, clock } = setup();
    queue.add(id(1), "view");
    clock.t += 23 * 3_600_000;
    queue.add(id(2), "view");
    clock.t += 2 * 3_600_000; // la 1re a 25 h, la 2e 2 h
    expect(await queue.flush()).toBe(true);
    expect(sent[0]?.map((e) => e.id)).toEqual([id(2)]);
    expect(sent[0]?.[0]?.at).toBe("2026-11-12T09:00:00.000Z");
  });

  it("un lot en vol reste dans l'état gardé jusqu'à l'acquittement : deux envois concurrents, puis redémarrage", async () => {
    let release: (() => void) | null = null;
    const clock = { t: Date.parse("2026-11-11T10:00:00.000Z") };
    const queue = createSeenQueue({
      now: () => clock.t,
      send: () => new Promise<SeenSendResult>((r) => (release = () => r("ok"))),
    });
    queue.add(id(1), "view");
    const first = queue.flush();
    expect(await queue.flush()).toBe(false); // le second envoi ne part pas : un lot est en vol
    // Ce qu'un second `flushSeen` sauvegarderait contient le lot en vol (un arrêt de l'appli ici ne perd rien).
    const saved = queue.snapshot();
    expect(saved.map((e) => e.id)).toEqual([id(1)]);
    // Redémarrage : une nouvelle file reprend l'état gardé et le renvoie.
    const sent: string[] = [];
    const restarted = createSeenQueue({
      now: () => clock.t,
      send: async (b) => (sent.push(...b.map((e) => e.id)), "ok"),
    });
    restarted.restore(saved);
    await restarted.flush();
    expect(sent).toEqual([id(1)]);
    (release as (() => void) | null)?.();
    await first;
    expect(queue.snapshot()).toEqual([]);
  });

  it("restore : les entrées gardées reprennent leur place, sans les périmées ni les inconnues", async () => {
    const { queue, sent, clock } = setup();
    queue.restore([
      { id: id(1), action: "view", at: "2026-11-11T08:00:00.000Z" },
      { id: id(2), action: "view", at: "2026-11-09T08:00:00.000Z" }, // plus de 24 h
      { id: id(3, "sponsored"), action: "view", at: "2026-11-11T08:00:00.000Z" },
      { id: "nimporte", action: "view" },
    ]);
    expect(clock.t).toBeGreaterThan(0);
    await queue.flush();
    expect(sent[0]?.map((e) => e.id)).toEqual([id(1)]);
  });
});

describe("« Tu es à jour » sur une vraie page", () => {
  it("rien de vu : pas de frontière ; tout vu : en tête ; au milieu : à la première carte vue", () => {
    expect(caughtUpIndex([card(1), card(2), card(3)])).toBe(-1);
    expect(caughtUpIndex([card(1, { seen: true }), card(2, { seen: true })])).toBe(0);
    expect(caughtUpIndex([card(1), card(2), card(3, { seen: true }), card(4, { seen: true })])).toBe(2);
  });
  it("ma publication épinglée reste au-dessus de la frontière, même si tout le reste est vu", () => {
    const mine = card(9, { seen: false });
    const items = withMyPublished([card(1, { seen: true }), card(2, { seen: true })], [mine]);
    expect(caughtUpIndex(items)).toBe(1);
  });
  it("une carte servie en zone A qui revient en zone B (borne de rognage) n'est pas affichée deux fois", () => {
    const state = { ...emptyFeedList("for_you"), items: [card(1), card(2)], nextCursor: "c1" };
    const next = applyFeedPage(
      state,
      { items: [card(2, { seen: true }), card(3, { seen: true })], nextCursor: null, filter: "for_you" },
      "c1",
    );
    expect(next?.state.items.map((c) => c.id)).toEqual([id(1), id(2), id(3)]);
    expect(appendCards([card(1)], [card(1, { seen: true })])).toHaveLength(1);
  });
});

describe("la copie hors ligne du Fil", () => {
  const kinds = ["feed_post", "spot_meetup", "sponsored", "event_recommended", "memory"] as const;
  const mixed = kinds.map((kind, i) => card(i + 1, { kind } as Partial<FeedCard>));

  it("sans rendez-vous au spot ni carte sponsorisée", () => {
    const out = feedCopyCards(mixed);
    expect(out.map((c) => c.kind)).toEqual(["feed_post", "event_recommended", "memory"]);
  });
  it("40 cartes au plus, les premières", () => {
    const many = Array.from({ length: 70 }, (_, i) => card(i + 1));
    const out = feedCopyCards(many);
    expect(out).toHaveLength(FEED_COPY_MAX);
    expect(out[0]?.id).toBe(id(1));
    expect(out[39]?.id).toBe(id(40));
  });
  it("une copie relue : du bon onglet seulement, cartes mal formées écartées, spot et sponsorisé retirés de nouveau", () => {
    const stored = { filter: "following", items: [...mixed, { oops: true }, null] };
    expect(parseFeedCopy(stored, "for_you")).toBeNull();
    expect(parseFeedCopy(stored, "following")?.map((c) => c.kind)).toEqual([
      "feed_post",
      "event_recommended",
      "memory",
    ]);
    expect(parseFeedCopy(null, "following")).toBeNull();
    expect(parseFeedCopy({ filter: "following", items: "x" }, "following")).toBeNull();
  });
  it("un Fil vide, ou fait seulement de rendez-vous au spot et de « Sponsorisé » : une copie vide (le Fil passe hors ligne quand même)", () => {
    expect(feedCopyCards([])).toEqual([]);
    expect(
      feedCopyCards([
        card(1, { kind: "spot_meetup" } as Partial<FeedCard>),
        card(2, { kind: "sponsored" } as Partial<FeedCard>),
      ]),
    ).toEqual([]);
  });
  it("une clé par onglet", () => {
    expect(new Set(["for_you", "nearby", "following"].map((f) => feedCopyKey(f as never))).size).toBe(3);
  });
});
