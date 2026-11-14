import { expect, test } from "@playwright/test";
import {
  type ContextLike,
  type FetchedLike,
  OWNER_PSEUDO,
  type RouteLike,
  type WebSocketLike,
  watchOwnerLeakViaRoutes,
} from "./ownerLeak";

// Le contrôle par interception (`watchOwnerLeakViaRoutes`, appli web) s'éprouve hors navigateur : même exigence que le contrôle par
// réponses (`ownerLeak.spec.ts`) : un corps attendu illisible ou une requête qui n'aboutit pas fait échouer ; un pseudo lu fait échouer.
const MARKERS = [OWNER_PSEUDO, "leo@orasso.local", "11111111-2222-4333-8444-555555555555"];

type Wanted = { url?: string; accept?: string; fetch: () => Promise<FetchedLike>; fulfill?: () => Promise<void> };

function fakeContext() {
  let handler: (route: RouteLike) => Promise<void> = async () => undefined;
  let match: (url: URL) => boolean = () => true;
  const sockets: ((frame: { payload: string | Uint8Array }) => void)[] = [];
  const socketPage = { on: (_e: "websocket", l: (ws: WebSocketLike) => void) => void pageListeners.push(l) };
  const pageListeners: ((ws: WebSocketLike) => void)[] = [];
  const context: ContextLike = {
    route: async (m, h) => {
      match = m;
      handler = h;
    },
    pages: () => [socketPage as never],
    on: () => undefined,
  };
  const outcome = { fulfilled: 0, aborted: 0, fallback: 0 };
  return {
    context,
    outcome,
    socket(url = "ws://x.test/api/ws") {
      const ws: WebSocketLike = { url: () => url, on: (_e, l) => void sockets.push(l) };
      for (const l of pageListeners) l(ws);
    },
    frame(payload: string | Uint8Array) {
      for (const l of sockets) l({ payload });
    },
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
          await w.fulfill?.();
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

test("par interception : une réponse qui arrive pendant l'attente finale est contrôlée (l'ancien contrôle ne prenait que les lectures présentes à l'appel)", async () => {
  const f = fakeContext();
  const w = await watchOwnerLeakViaRoutes(f.context, { markers: MARKERS });
  let finishFirst: (r: FetchedLike) => void = () => undefined;
  const first = f.request({ fetch: () => new Promise<FetchedLike>((resolve) => (finishFirst = resolve)) });
  const done = w.done();
  // Pendant l'attente : une seconde requête part, avec le pseudo du titulaire ; puis la première se termine.
  const second = f.request({ fetch: ok(`{"by":"${OWNER_PSEUDO}"}`) });
  await second;
  finishFirst({ status: () => 200, headers: () => ({}), text: async () => '{"ok":true}' });
  await first;
  await expect(done).rejects.toThrow(/portent le pseudo/);
});

test("par interception : la livraison à la page est attendue ; un échec de livraison fait échouer, une page déjà fermée non", async () => {
  const f = fakeContext();
  const w = await watchOwnerLeakViaRoutes(f.context, { markers: MARKERS });
  await f.request({ fetch: ok('{"ok":true}') });
  await f.request({ fetch: ok('{"ok":true}'), fulfill: () => Promise.reject(new Error("Protocol error: boom")) });
  await expect(w.done()).rejects.toThrow(/livraison impossible/);
  const g = fakeContext();
  const w2 = await watchOwnerLeakViaRoutes(g.context, { markers: MARKERS });
  await g.request({ fetch: ok('{"ok":true}') });
  await g.request({
    fetch: ok('{"ok":true}'),
    fulfill: () => Promise.reject(new Error("Target page, context or browser has been closed")),
  });
  await expect(w2.done()).resolves.toBeUndefined();
});

test("par interception : la lecture n'est comptée qu'une fois la réponse livrée", async () => {
  const f = fakeContext();
  const w = await watchOwnerLeakViaRoutes(f.context, { markers: MARKERS, readTimeoutMs: 500 });
  await f.request({ fetch: ok('{"ok":true}') });
  let delivered = false;
  const slow = f.request({
    fetch: ok('{"ok":true}'),
    fulfill: () =>
      new Promise<void>((resolve) =>
        setTimeout(() => {
          delivered = true;
          resolve();
        }, 60),
      ),
  });
  const done = w.done();
  await done;
  expect(delivered).toBe(true);
  await slow;
});

test("par interception : une trame du WebSocket qui porte le pseudo fait échouer", async () => {
  const f = fakeContext();
  const w = await watchOwnerLeakViaRoutes(f.context, { markers: MARKERS });
  await f.request({ fetch: ok('{"ok":true}') });
  f.socket();
  f.frame('{"type":"typing","by":"Kenji_66"}');
  await expect(w.done()).resolves.toBeUndefined();
  f.frame(`{"type":"message","by":"${OWNER_PSEUDO}"}`);
  await expect(w.done()).rejects.toThrow(/portent le pseudo/);
});

// Tour 5 : la période calme part de l'appel de `done()` (réponse propre, 550 ms de silence, puis `done()` et une fuite 50 ms après).
test("par interception : la fenêtre de calme part de done() (réponse propre, 550 ms de silence, fuite 50 ms après)", async () => {
  const f = fakeContext();
  const w = await watchOwnerLeakViaRoutes(f.context, { markers: MARKERS });
  await f.request({ fetch: ok('{"ok":true}') });
  await new Promise((r) => setTimeout(r, 550));
  const done = w.done();
  setTimeout(() => void f.request({ fetch: ok(`{"by":"${OWNER_PSEUDO}"}`) }), 50);
  await expect(done).rejects.toThrow(/portent le pseudo/);
});

// Tour 5 : la livraison à la page (`route.fulfill()`) est bornée ; une livraison qui ne se résout jamais est un échec avec diagnostic.
test("par interception : une livraison qui ne se résout jamais fait échouer au délai, avec diagnostic", async () => {
  const f = fakeContext();
  const w = await watchOwnerLeakViaRoutes(f.context, { markers: MARKERS, readTimeoutMs: 100 });
  await f.request({ fetch: ok('{"ok":true}') });
  void f.request({ fetch: ok('{"ok":true}'), fulfill: () => new Promise<void>(() => undefined) });
  const started = Date.now();
  await expect(w.done()).rejects.toThrow(/livraison non terminée après 100 ms/);
  expect(Date.now() - started).toBeLessThan(3_000);
});
