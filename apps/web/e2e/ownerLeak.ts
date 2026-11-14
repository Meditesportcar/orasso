import { expect } from "@playwright/test";
import { apiCall, login } from "./helpers";

// Contrôle de confidentialité des recettes R9i (tours 2 et 3) : aucune réponse reçue par le navigateur de la personne identifiée ne porte le
// pseudo, l'identifiant ni l'e-mail du titulaire de la page du média. Le contrôle **échoue** quand un corps attendu n'a pas pu être lu
// (erreur de lecture, délai dépassé) : seules les réponses sans corps (204, 205, 304, redirections) et les flux sont écartées ; seuls les
// corps réellement lus comptent, et au moins un corps non vide doit avoir été lu. Les requêtes attendues sont suivies dès leur départ et
// `done()` attend que la collection soit stable (plus aucune requête en vol, aucune lecture ajoutée) avant de contrôler : une réponse
// arrivée pendant l'attente finale est contrôlée comme les autres. Les trames reçues du WebSocket (temps réel) passent par le même contrôle.

export const OWNER_PSEUDO = "Leo_SudCars";
export const OWNER_EMAIL = "leo@orasso.local";

/** Ce qui identifie le titulaire : son pseudo, son e-mail, son identifiant de compte (lu par son propre /me). */
export async function ownerMarkers(): Promise<string[]> {
  const cookie = await login(OWNER_EMAIL);
  const me = await apiCall<{ user: { id: string } }>(cookie, "GET", "/me");
  expect(me.status).toBe(200);
  expect(me.data.user.id).toBeTruthy();
  return [OWNER_PSEUDO, OWNER_EMAIL, me.data.user.id];
}

export type ResponseLike = {
  url(): string;
  status(): number;
  headers(): Record<string, string>;
  text(): Promise<string>;
};
export type RequestLike = { url(): string; headers(): Record<string, string> };
export type WebSocketLike = {
  url(): string;
  on(event: "framereceived", listener: (frame: { payload: string | Uint8Array }) => void): unknown;
};
export type PageLike = {
  on(event: "response", listener: (res: ResponseLike) => void): unknown;
  on(event: "request" | "requestfinished" | "requestfailed", listener: (req: RequestLike) => void): unknown;
  on(event: "websocket", listener: (ws: WebSocketLike) => void): unknown;
};

/** Les réponses qui n'ont, par nature, aucun corps à lire. */
export const hasNoBody = (status: number) =>
  status < 200 || status === 204 || status === 205 || status === 304 || (status >= 300 && status < 400);

/** Les réponses d'API (`/api/`) et, côté site, les données des chargeurs de React Router (`*.data`). */
export const apiOrLoaderData = (url: string) => {
  const u = new URL(url);
  return u.pathname.includes("/api/") || u.pathname.endsWith(".data");
};
export const apiOnly = (url: string) => url.includes("/api/");

type Read = { url: string; text: string | null; problem: string | null };
type Opts = { markers: string[]; match?: (url: string) => boolean; readTimeoutMs?: number };

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));
/** Les seules erreurs de livraison qu'on laisse passer : la page, le contexte ou le navigateur est déjà fermé (rien à rendre à personne). */
export const isClosedError = (e: unknown) =>
  /Target page, context or browser has been closed|Target closed|Browser has been closed|has been closed|has been disposed/i.test(
    messageOf(e),
  );

/**
 * Ce que le contrôle a vu : les lectures de corps (commencées dès le départ de la requête ou de la réponse), les trames du temps réel,
 * et les requêtes encore en vol. `done()` attend que tout soit stable avant de contrôler.
 */
function collector(markers: string[], timeoutMs: number) {
  const reads: Promise<Read>[] = [];
  const frames: Read[] = [];
  const inflight = new Map<RequestLike, string>();

  /** Attend les lectures, y compris celles qui arrivent pendant l'attente, jusqu'à ce qu'aucune requête ne soit plus en vol. */
  async function settle(): Promise<Read[]> {
    const hardDeadline = Date.now() + 4 * timeoutMs;
    const requestDeadline = Date.now() + timeoutMs;
    for (;;) {
      const n = reads.length;
      await Promise.all(reads);
      if (Date.now() >= hardDeadline) {
        return [
          {
            url: "(collection)",
            text: null,
            problem: "des requêtes continuent d'arriver : le contrôle ne se stabilise pas",
          },
        ];
      }
      if (reads.length !== n) continue;
      if (inflight.size === 0) return [];
      if (Date.now() >= requestDeadline) {
        return [...inflight.values()].map((url) => ({
          url,
          text: null,
          problem: `requête encore en route après ${timeoutMs} ms`,
        }));
      }
      await new Promise((r) => setTimeout(r, 20));
    }
  }

  return {
    reads,
    frames,
    inflight,
    /** Lit le corps d'une réponse (délai borné) ; une erreur ou un dépassement est un problème, jamais une chaîne vide. */
    readBody(url: string, res: { text(): Promise<string> }) {
      reads.push(
        new Promise<Read>((resolve) => {
          const timer = setTimeout(
            () => resolve({ url, text: null, problem: `corps non lu après ${timeoutMs} ms` }),
            timeoutMs,
          );
          res.text().then(
            (text) => {
              clearTimeout(timer);
              resolve({ url, text, problem: null });
            },
            (e: unknown) => {
              clearTimeout(timer);
              resolve({ url, text: null, problem: `lecture impossible (${messageOf(e)})` });
            },
          );
        }),
      );
    },
    /** Une trame reçue du WebSocket : son texte est contrôlé comme un corps (elle ne compte pas comme « corps lu »). */
    watchSocket(ws: WebSocketLike, match: (url: string) => boolean) {
      const url = ws.url();
      if (!match(url.replace(/^ws/, "http"))) return;
      ws.on("framereceived", ({ payload }) => {
        const text = typeof payload === "string" ? payload : new TextDecoder().decode(payload);
        frames.push({ url, text, problem: null });
      });
    },
    /** Attend que la collection soit stable, puis contrôle : aucune illisible, au moins un corps non vide lu, aucun marqueur du titulaire. */
    async done() {
      const unsettled = await settle();
      const all = [...(await Promise.all(reads)), ...unsettled];
      expect(
        all.filter((r) => r.problem !== null).map((r) => `${r.url} : ${r.problem}`),
        "des réponses attendues n'ont pas pu être lues : le contrôle ne vaut rien",
      ).toEqual([]);
      const bodies = all.filter((r): r is Read & { text: string } => r.text !== null);
      expect(bodies.filter((r) => r.text.length > 0).length, "aucun corps de réponse lu").toBeGreaterThan(0);
      const lower = markers.map((m) => m.toLowerCase());
      const seen = [...bodies, ...frames.filter((r): r is Read & { text: string } => r.text !== null)];
      expect(
        seen.filter((r) => lower.some((m) => r.text.toLowerCase().includes(m))).map((r) => r.url),
        "réponses ou trames qui portent le pseudo, l'e-mail ou l'identifiant du titulaire",
      ).toEqual([]);
    },
  };
}

export function watchOwnerLeak(page: PageLike, opts: Opts) {
  const match = opts.match ?? apiOnly;
  const c = collector(opts.markers, opts.readTimeoutMs ?? 15_000);
  // Un flux (SSE) ne se termine jamais : sa requête n'est pas suivie.
  const streamRequest = (req: RequestLike) => req.headers().accept?.includes("event-stream");
  page.on("request", (req) => {
    if (match(req.url()) && !streamRequest(req)) c.inflight.set(req, req.url());
  });
  page.on("requestfinished", (req) => void c.inflight.delete(req));
  page.on("requestfailed", (req) => void c.inflight.delete(req));
  page.on("response", (res) => {
    const url = res.url();
    if (!match(url)) return;
    if (res.headers()["content-type"]?.includes("event-stream")) return;
    if (hasNoBody(res.status())) return;
    c.readBody(url, res);
  });
  page.on("websocket", (ws) => c.watchSocket(ws, match));
  return c;
}

export type FetchedLike = { status(): number; headers(): Record<string, string>; text(): Promise<string> };
export type RouteLike = {
  request(): { url(): string; headers(): Record<string, string> };
  fetch(options?: { timeout?: number }): Promise<FetchedLike>;
  fulfill(options: { response: FetchedLike }): Promise<void>;
  fallback(): Promise<void>;
  abort(): Promise<void>;
};
export type ContextLike = {
  route(match: (url: URL) => boolean, handler: (route: RouteLike) => Promise<void>): Promise<unknown>;
  pages(): Pick<PageLike, "on">[];
  on(event: "page", listener: (page: Pick<PageLike, "on">) => void): unknown;
};

/**
 * Même contrôle, pour l'appli : les réponses sont lues par le contrôle lui-même (`route.fetch`), puis rendues telles quelles à la page. Une
 * partie des requêtes de l'appli échappait à la lecture des corps par CDP (`response.text()` échouait ou ne finissait pas) ; la cause n'est
 * pas établie (aucun service worker ni worker dans `apps/mobile/src`) : l'interception lit les corps au niveau du réseau. Limite : les
 * `OPTIONS` CORS sont servis par Playwright et les redirections suivies, donc `appli-lotr9i` ne prouve plus le CORS de l'API (les autres
 * recettes de l'appli le font). Mêmes règles : une réponse sans corps ou un flux passe sans lecture ; tout autre corps doit être lu, et
 * livré (un échec de livraison, hors fermeture de la page ou du contexte, est un problème), sinon le contrôle échoue. Les trames du
 * WebSocket des pages du contexte passent par le même contrôle.
 */
export async function watchOwnerLeakViaRoutes(context: ContextLike, opts: Opts) {
  const match = opts.match ?? apiOnly;
  const timeoutMs = opts.readTimeoutMs ?? 15_000;
  const c = collector(opts.markers, timeoutMs);
  const attach = (page: Pick<PageLike, "on">) => page.on("websocket", (ws) => c.watchSocket(ws, match));
  for (const page of context.pages()) attach(page);
  context.on("page", attach);
  await context.route(
    (u) => match(u.toString()),
    async (route) => {
      const url = route.request().url();
      if (route.request().headers().accept?.includes("event-stream")) return route.fallback();
      // La lecture existe dès le départ de la requête et ne se termine qu'une fois la réponse livrée à la page.
      let resolveRead: (r: Read) => void = () => undefined;
      c.reads.push(new Promise<Read>((resolve) => (resolveRead = resolve)));
      let fetched: FetchedLike;
      try {
        fetched = await route.fetch({ timeout: timeoutMs });
      } catch (e) {
        await route.abort().catch(() => undefined);
        resolveRead({ url, text: null, problem: `requête impossible (${messageOf(e)})` });
        return;
      }
      let text: string | null = "";
      let problem: string | null = null;
      if (!(fetched.headers()["content-type"]?.includes("event-stream") || hasNoBody(fetched.status()))) {
        try {
          text = await fetched.text();
        } catch (e) {
          text = null;
          problem = `lecture impossible (${messageOf(e)})`;
        }
      }
      // La page reçoit la réponse telle quelle ; seule une page ou un contexte déjà fermé excuse l'échec de la livraison.
      try {
        await route.fulfill({ response: fetched });
      } catch (e) {
        if (!isClosedError(e)) problem ??= `livraison impossible (${messageOf(e)})`;
      }
      resolveRead({ url, text, problem });
    },
  );
  return c;
}
