import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({
  scope: "a" as string | null,
  sent: [] as unknown[][],
  saved: [] as { key: string; scope: string | null; value: unknown }[],
  release: null as (() => void) | null,
  slow: false,
}));
vi.mock("react-native", () => ({
  AppState: { currentState: "active", addEventListener: () => ({ remove: () => undefined }) },
}));
vi.mock("expo-router", () => ({ useIsFocused: () => true }));
vi.mock("@/ui/ScrollAssist", () => ({ useScrollAssist: () => null }));
vi.mock("@/lib/kv", () => ({ cacheScope: () => env.scope }));
vi.mock("@/lib/http", () => ({
  ApiRequestError: class extends Error {
    status = 0;
  },
}));
vi.mock("@/lib/offlineCopy", () => ({
  readCopy: async () => null,
  saveCopy: async (
    key: string,
    value: unknown,
    _now: Date,
    account: { scope: string | null; current: () => boolean },
  ) => {
    if (account.current()) env.saved.push({ key, scope: account.scope, value });
  },
}));
vi.mock("@/lib/api", () => ({
  api: {
    feedSeen: async (cards: unknown[]) => {
      if (env.slow) await new Promise<void>((r) => (env.release = r));
      env.sent.push(cards);
    },
  },
}));

const id = (i: number) => `feed_post:00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;

describe("file des cartes vues : changement de compte", () => {
  let t: typeof import("./seenTracker");
  beforeEach(async () => {
    vi.resetModules();
    env.scope = "a";
    env.sent = [];
    env.saved = [];
    env.slow = false;
    t = await import("./seenTracker");
  });

  it("A se déconnecte pendant un envoi lent, B se connecte : le reste de la file de A ne part jamais au nom de B", async () => {
    for (let i = 1; i <= 120; i++) t.noteSeen(id(i), "view");
    env.slow = true;
    const flushing = t.flushSeen();
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    env.scope = "b"; // A part, B arrive pendant l'envoi
    env.release?.();
    env.slow = false;
    await flushing;
    // Le premier lot était déjà parti (au nom de A) ; rien d'autre n'est envoyé sous B.
    expect(env.sent.length).toBeLessThanOrEqual(1);
    // Rien n'est écrit dans la copie de B.
    expect(env.saved.every((s) => s.scope === "a")).toBe(true);
    // La file de B est la sienne : vide.
    await t.flushSeen();
    expect(env.sent.length).toBeLessThanOrEqual(1);
  });

  it("n'écrit la file gardée que si elle a changé", async () => {
    t.noteSeen(id(1), "view");
    env.scope = "a";
    await t.flushSeen();
    const first = env.saved.length;
    await t.flushSeen();
    await t.flushSeen();
    expect(env.saved.length).toBe(first);
  });
});
