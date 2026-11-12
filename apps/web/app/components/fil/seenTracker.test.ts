import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ sent: [] as unknown[], release: null as (() => void) | null }));
vi.mock("../../lib/api.client", () => ({
  apiFetch: (_path: string, init: { json: { cards: unknown[] } }) =>
    new Promise((resolve) => {
      env.sent.push(init.json.cards);
      env.release = () => resolve({ ok: false, status: 503 });
    }),
}));

const id = (i: number) => `feed_post:00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;

describe("site : la file des cartes vues suit la session", () => {
  let t: typeof import("./seenTracker");
  beforeEach(async () => {
    vi.resetModules();
    env.sent = [];
    t = await import("./seenTracker");
  });

  it("envoi lent de A, déconnexion : l'échec ne repart pas, aucun lot suivant avec la session de B", async () => {
    for (let i = 1; i <= 120; i++) t.noteSeenAction("a", id(i), "view");
    const flushing = t.flushSeenActions("a"); // premier lot de 50, réponse attendue
    await new Promise((r) => setTimeout(r, 0));
    expect(env.sent).toHaveLength(1);
    t.resetSeen(); // déconnexion
    t.noteSeenAction("b", id(999), "view");
    env.release?.(); // la réponse de A arrive (503) : sa file n'est plus celle de l'onglet
    expect(await flushing).toBe(false);
    expect(env.sent).toHaveLength(1);
    // B envoie sa propre file, rien de A.
    const bFlush = t.flushSeenActions("b");
    await new Promise((r) => setTimeout(r, 0));
    expect(env.sent).toHaveLength(2);
    expect((env.sent[1] as { id: string }[]).map((c) => c.id)).toEqual([id(999)]);
    env.release?.();
    await bFlush;
  });
});
