// L'acteur côté site (lot R9h, T48 et T49) : la liste blanche est celle de l'appli, au caractère près ; `api` (loaders) et `apiFetch`
// (navigateur) ne posent `x-orasso-actor` que pour une route de la liste ; hors liste l'option est ignorée.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ACTOR_HEADER } from "@orasso/shared";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ActorIfAny,
  ActorProvider,
  actorOfParam,
  casquetteOfParam,
  useActor,
  useCasquette,
  withActorParam,
  withoutActorParam,
} from "./actor";
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

// Lot R9h, partie 2 : la page d'un prestataire ou d'un média ouverte depuis l'espace d'une casquette garde la casquette dans son adresse
// (`?auteur=`), jamais dans un cookie ; une clé qui n'est pas au compte n'est jamais crue.
describe("la casquette portée par l'adresse (`?auteur=`)", () => {
  const personas = [
    { kind: "fan", id: "u1", label: "Moi", assisted: false },
    { kind: "organizer", id: "st1", label: "Roues Libres 66", assisted: false, logoUrl: "/logo.png" },
    { kind: "pro", id: "pr1", label: "Garage", assisted: false },
    { kind: "organizer", id: "st2", label: "Survolée", assisted: true },
    { kind: "organizer", id: "st3", label: "Suspendue", assisted: false, suspended: true },
  ] as unknown as Parameters<typeof actorOfParam>[1];

  it("withActorParam : sans casquette l'adresse ne change pas ; avec, `?auteur=` ou `&auteur=` (clé encodée)", () => {
    expect(withActorParam("/providers/p1", null)).toBe("/providers/p1");
    expect(withActorParam("/providers/p1", "s:st1")).toBe("/providers/p1?auteur=s%3Ast1");
    expect(withActorParam("/m/m1?onglet=albums", "s:st1")).toBe("/m/m1?onglet=albums&auteur=s%3Ast1");
  });

  it("actorOfParam : la clé d'une page tenue est reprise ; absente, `me`, inconnue, survolée ou suspendue : la personne (null)", () => {
    expect(actorOfParam("s:st1", personas)).toBe("s:st1");
    expect(actorOfParam("p:pr1", personas)).toBe("p:pr1");
    expect(actorOfParam(null, personas)).toBeNull();
    expect(actorOfParam("me", personas)).toBeNull();
    expect(actorOfParam("s:inconnue", personas)).toBeNull();
    expect(actorOfParam("p:st1", personas), "l'identifiant d'une autre casquette").toBeNull();
    expect(actorOfParam("s:st2", personas), "survol d'assistance").toBeNull();
    expect(actorOfParam("s:st3", personas), "page suspendue").toBeNull();
    expect(actorOfParam("x:st1", personas), "préfixe inconnu").toBeNull();
  });

  it("casquetteOfParam : la clé, le nom et le logo de la casquette (pastille « Tu agis au nom de »), null sinon", () => {
    expect(casquetteOfParam("s:st1", personas)).toEqual({
      key: "s:st1",
      name: "Roues Libres 66",
      logoUrl: "/logo.png",
    });
    expect(casquetteOfParam("p:pr1", personas)).toEqual({ key: "p:pr1", name: "Garage", logoUrl: null });
    expect(casquetteOfParam("s:st3", personas), "page suspendue").toBeNull();
    expect(casquetteOfParam("s:st2", personas), "survol d'assistance").toBeNull();
    expect(casquetteOfParam("s:autre", personas), "clé non tenue par le compte").toBeNull();
    expect(casquetteOfParam(null, personas)).toBeNull();
  });

  it("withoutActorParam : « En mon nom » retire seulement `auteur`, le reste de l'adresse est gardé", () => {
    expect(withoutActorParam(new URL("http://x/providers/p1?auteur=s%3Ast1"))).toBe("/providers/p1");
    expect(withoutActorParam(new URL("http://x/m/m1?onglet=albums&auteur=s%3Ast1&retour=%2Fapp"))).toBe(
      "/m/m1?onglet=albums&retour=%2Fapp",
    );
    expect(withoutActorParam(new URL("http://x/m/m1?onglet=mentions"))).toBe("/m/m1?onglet=mentions");
  });
});

// Tour 2 de la partie 2 : `/m` et `/providers` enveloppent leur contenu dans `ActorProvider` quand l'adresse porte la casquette : tout ce qui
// lit `useActor()` (commentaires, lectures de commentaires) part alors au nom de la page ; sans casquette, la personne.
describe("ActorProvider autour d'une page publique portant `auteur`", () => {
  const Probe = () => createElement("i", null, `${useActor()}|${useCasquette()?.name}`);
  it("un enfant lit la clé et le nom de la casquette ; sans casquette, `null`", () => {
    const withCasquette = renderToStaticMarkup(
      createElement(ActorProvider, {
        casquette: { key: "s:st1", name: "Roues Libres 66", logoUrl: null },
        // biome-ignore lint/correctness/noChildrenProp: fichier .ts, `children` est une propriété requise du fournisseur
        children: createElement(Probe),
      }),
    );
    expect(withCasquette).toBe("<i>s:st1|Roues Libres 66</i>");
    const without = renderToStaticMarkup(
      // biome-ignore lint/correctness/noChildrenProp: fichier .ts, `children` est une propriété requise du fournisseur
      createElement(ActorProvider, { casquette: null, children: createElement(Probe) }),
    );
    expect(without).toBe("<i>null|undefined</i>");
    // `ActorIfAny` : sans casquette, le contenu reste tel quel ; avec, il lit la casquette.
    expect(
      renderToStaticMarkup(
        // biome-ignore lint/correctness/noChildrenProp: fichier .ts, `children` est une propriété requise
        createElement(ActorIfAny, { casquette: null, children: createElement(Probe) }),
      ),
    ).toBe("<i>null|undefined</i>");
    expect(
      renderToStaticMarkup(
        createElement(ActorIfAny, {
          casquette: { key: "m:m1", name: "Sud Cars", logoUrl: null },
          // biome-ignore lint/correctness/noChildrenProp: fichier .ts, `children` est une propriété requise
          children: createElement(Probe),
        }),
      ),
    ).toBe("<i>m:m1|Sud Cars</i>");
  });
});
