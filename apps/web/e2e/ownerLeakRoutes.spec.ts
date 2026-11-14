import { expect, test } from "@playwright/test";
import { type ContextLike, type FetchedLike, OWNER_PSEUDO, type RouteLike, watchOwnerLeakViaRoutes } from "./ownerLeak";

// Le contrôle par interception (`watchOwnerLeakViaRoutes`, appli web) s'éprouve hors navigateur : même exigence que le contrôle par
// réponses (`ownerLeak.spec.ts`) : un corps attendu illisible ou une requête qui n'aboutit pas fait échouer ; un pseudo lu fait échouer.
const MARKERS = [OWNER_PSEUDO, "leo@orasso.local", "11111111-2222-4333-8444-555555555555"];

type Wanted = { url?: string; accept?: string; fetch: () => Promise<FetchedLike> };

function fakeContext() {
  let handler: (route: RouteLike) => Promise<void> = async () => undefined;
  let match: (url: URL) => boolean = () => true;
  const context: ContextLike = {
    route: async (m, h) => {
      match = m;
      handler = h;
    },
  };
  const outcome = { fulfilled: 0, aborted: 0, fallback: 0 };
  return {
    context,
    outcome,
    async request(w: Wanted) {
      const url = w.url ?? "http://x.test/api/ok";
      if (!match(new URL(url))) return;
      await handler({
        request: () => ({
          url: () => url,
          headers: () => (w.accept ? { accept: w.accept } : ({} as Record<string, string>)),
        }),
        fetch: () => w.fetch(),
        fulfill: async () => {
          outcome.fulfilled++;
        },
        fallback: async () => {
          outcome.fallback++;
        },
        abort: async () => {
          outcome.aborted++;
        },
      });
    },
  };
}
const ok =
  (text: string, status = 200): (() => Promise<FetchedLike>) =>
  async () => ({ status: () => status, headers: () => ({}), text: async () => text });

test("par interception : une réponse propre passe, la page la reçoit", async () => {
  const f = fakeContext();
  const w = await watchOwnerLeakViaRoutes(f.context, { markers: MARKERS });
  await f.request({ fetch: ok('{"ok":true}') });
  await f.request({ url: "http://x.test/elsewhere", fetch: ok("ignorée") });
  await expect(w.done()).resolves.toBeUndefined();
  expect(f.outcome).toEqual({ fulfilled: 1, aborted: 0, fallback: 0 });
});

test("par interception : un corps qui porte le pseudo, l'e-mail ou l'identifiant fait échouer", async () => {
  for (const leak of [OWNER_PSEUDO, "leo@orasso.local", MARKERS[2] as string]) {
    const f = fakeContext();
    const w = await watchOwnerLeakViaRoutes(f.context, { markers: MARKERS });
    await f.request({ fetch: ok('{"ok":true}') });
    await f.request({ fetch: ok(`{"x":"${leak}"}`) });
    await expect(w.done()).rejects.toThrow(/portent le pseudo/);
  }
});

test("par interception : une requête qui n'aboutit pas ou un corps illisible fait échouer", async () => {
  const f = fakeContext();
  const w = await watchOwnerLeakViaRoutes(f.context, { markers: MARKERS });
  await f.request({ fetch: ok('{"ok":true}') });
  await f.request({ fetch: () => Promise.reject(new Error("Timeout 15000ms exceeded")) });
  await expect(w.done()).rejects.toThrow(/n'ont pas pu être lues/);
  expect(f.outcome.aborted).toBe(1);
  const g = fakeContext();
  const w2 = await watchOwnerLeakViaRoutes(g.context, { markers: MARKERS });
  await g.request({ fetch: ok('{"ok":true}') });
  await g.request({
    fetch: async () => ({
      status: () => 200,
      headers: () => ({}),
      text: () => Promise.reject(new Error("corps tronqué")),
    }),
  });
  await expect(w2.done()).rejects.toThrow(/n'ont pas pu être lues/);
});

test("par interception : un flux passe sans lecture, une réponse sans corps (204, 304, redirection) aussi ; rien de lu fait échouer", async () => {
  const f = fakeContext();
  const w = await watchOwnerLeakViaRoutes(f.context, { markers: MARKERS });
  await f.request({ accept: "text/event-stream", fetch: () => Promise.reject(new Error("jamais appelé")) });
  expect(f.outcome.fallback).toBe(1);
  await f.request({
    fetch: async () => ({
      status: () => 204,
      headers: () => ({}),
      text: () => Promise.reject(new Error("sans corps")),
    }),
  });
  await f.request({
    fetch: async () => ({
      status: () => 304,
      headers: () => ({}),
      text: () => Promise.reject(new Error("sans corps")),
    }),
  });
  await expect(w.done()).rejects.toThrow(/aucun corps de réponse lu/);
  await f.request({ fetch: ok('{"ok":true}') });
  await expect(w.done()).resolves.toBeUndefined();
});
