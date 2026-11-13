// L'acteur côté site (lot R9h, T48 et T49) : la liste blanche est celle de l'appli, au caractère près ; `api` (loaders) et `apiFetch`
// (navigateur) ne posent `x-orasso-actor` que pour une route de la liste ; hors liste l'option est ignorée.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ACTOR_HEADER } from "@orasso/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ACTOR_ROUTES, actorHeaders, carriesActor } from "./actorRoutes";
import { api } from "./api.server";

/** Les appels de l'appli qui passent `actor` : `METHOD /chemin`, lus dans `apps/mobile/src/lib/api/*.ts`. */
function mobileActorRoutes(): string[] {
  const dir = new URL("../../../mobile/src/lib/api/", import.meta.url);
  const found = new Set<string>();
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".ts") || name.endsWith(".test.ts")) continue;
    // Sans les commentaires : « (`actor`) » y est cité avant l'appel qui suit, il ne doit pas compter pour lui.
    const source = readFileSync(fileURLToPath(new URL(name, dir)), "utf8")
      .split("\n")
      .map((line) => line.replace(/^\s*\/\/.*$/, "").replace(/\s\/\/\s.*$/, ""))
      .join("\n");
    for (const chunk of source.split(/\brequest</).slice(1)) {
      const call = chunk.match(/([`"])\/api(\/.*?)\1([\s\S]*?)(?=\n\s*(?:[a-zA-Z]+:\s|\},?\n|\}\);)|$)/);
      if (!call) continue;
      const options = call[3] ?? "";
      if (!/[{,]\s*actor\b/.test(options)) continue;
      const method = options.match(/method:\s*"([A-Z]+)"/)?.[1] ?? "GET";
      const path = (call[2] ?? "")
        .replace(/\$\{qs\(.*$/, "")
        .replace(/\$\{(?:encodeURIComponent\()?([A-Za-z]+)\)?\}/g, (_m, v: string) => `:${v}`);
      found.add(`${method} ${path}`);
    }
  }
  return [...found].sort();
}

// Les noms de paramètres diffèrent d'un côté à l'autre (`:key` / `:targetKey`) : seule la forme du chemin compte.
const normalize = (path: string): string => path.replace(/:[A-Za-z]+/g, ":x");

describe("liste blanche de l'en-tête de l'acteur (T49) : celle de l'appli", () => {
  it("mêmes routes que les appels de l'appli qui passent `actor`, au caractère près", () => {
    const mobile = mobileActorRoutes().map((r) => {
      const [method, path] = r.split(" ");
      return `${method} ${normalize(path ?? "")}`;
    });
    const web = ACTOR_ROUTES.map((r) => `${r.method} ${normalize(r.path)}`);
    expect(mobile.length).toBeGreaterThan(10);
    expect([...new Set(web)].sort()).toEqual([...new Set(mobile)].sort());
  });
});

describe("carriesActor : seules les routes de la liste portent l'acteur", () => {
  it("les routes de la liste, avec ou sans requête", () => {
    expect(carriesActor("GET", "/fil?filter=for_you")).toBe(true);
    expect(carriesActor("GET", "/fil/fresh?since=x")).toBe(true);
    expect(carriesActor("GET", "/stories/bar")).toBe(true);
    expect(carriesActor("POST", "/feed-posts/p1/comments")).toBe(true);
    expect(carriesActor("GET", "/feed-posts/p1/comments?cursor=c")).toBe(true);
    expect(carriesActor("PUT", "/me/page-follows/v%3Av1")).toBe(true);
    // R9h, tour 1 : la conversation se lit avec les droits de la page (réponses, suggestions « @ »), pas seulement les commentaires.
    expect(carriesActor("GET", "/feed-comments/c1/replies?cursor=x")).toBe(true);
    expect(carriesActor("GET", "/feed-posts/p1/mention-suggestions?q=ma")).toBe(true);
    expect(carriesActor("DELETE", "/structures/s1/follow")).toBe(true);
  });
  it("jamais la flamme, le signalement, les cartes vues, les messages, « Publier » ni une route voisine", () => {
    expect(carriesActor("POST", "/feed-posts/p1/flame")).toBe(false);
    expect(carriesActor("PUT", "/feed-comments/c1/reaction")).toBe(false);
    expect(carriesActor("DELETE", "/feed-comments/c1")).toBe(false);
    expect(carriesActor("PUT", "/feed-posts/p1/flame")).toBe(false);
    expect(carriesActor("POST", "/me/feed-posts")).toBe(false);
    expect(carriesActor("POST", "/me/stories")).toBe(false);
    expect(carriesActor("POST", "/me/feed/seen")).toBe(false);
    expect(carriesActor("GET", "/me/inbox/summary")).toBe(false);
    expect(carriesActor("POST", "/reports")).toBe(false);
    expect(carriesActor("GET", "/media/m1/contents")).toBe(false);
    expect(carriesActor("GET", "/fil/extra/path")).toBe(false);
    // La bonne route avec une autre méthode n'est pas sur la liste.
    expect(carriesActor("DELETE", "/feed-posts/p1/comments")).toBe(false);
    expect(carriesActor("POST", "/fil")).toBe(false);
  });
  it("actorHeaders : rien sans acteur, rien hors liste, l'en-tête sinon", () => {
    expect(actorHeaders("GET", "/fil", null)).toEqual({});
    expect(actorHeaders("GET", "/fil", undefined)).toEqual({});
    expect(actorHeaders("GET", "/fil", "")).toEqual({});
    expect(actorHeaders("POST", "/feed-posts/p1/flame", "s:s1")).toEqual({});
    expect(actorHeaders("GET", "/fil?filter=following", "s:s1")).toEqual({ [ACTOR_HEADER]: "s:s1" });
  });
});

// `apiFetch` (navigateur) passe par le même `actorHeaders` ; son module `.client` n'existe pas côté serveur (vitest) : la recette
// `lotr9h-site.spec.ts` lit les requêtes du navigateur (en-tête présent sur /fil, absent sur la flamme et pour le passionné).
describe("api (serveur, loaders) ne pose l'en-tête que sur la liste", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("/stories/bar avec acteur → en-tête ; une route hors liste avec acteur → rien ; sans acteur → rien", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const request = new Request("http://localhost:7101/orga/x/fil");
    await api(request, "/stories/bar", { actor: "p:p1" });
    await api(request, "/me/inbox/summary", { actor: "p:p1" });
    await api(request, "/stories/bar");
    const sent = fetchMock.mock.calls.map((c) => {
      const init = (c as unknown as [string, RequestInit])[1];
      return new Headers(init.headers).get(ACTOR_HEADER);
    });
    expect(sent).toEqual(["p:p1", null, null]);
  });
});
