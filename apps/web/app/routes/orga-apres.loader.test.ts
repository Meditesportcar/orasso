// L'Après de la gestion d'un événement (lot B2b, tour 1) : une panne des albums n'est pas une absence. La ligne « Photos » reste, avec
// un compteur inconnu (« – »), un message et « Réessayer » ; sans album, rien (pas d'état vide) ; avec des albums, la ligne et son compte.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/** Les lectures d'albums : `ok` (liste), `down` (503), `forbidden` (403). */
let albums: "ok" | "empty" | "down" | "forbidden" = "ok";

const EVENT = {
  id: "ev-1",
  title: "Rassemblement JDM",
  startsAt: "2026-10-01T09:00:00.000Z",
  endsAt: "2026-10-01T17:00:00.000Z",
  structure: { id: "st-1" },
};

vi.mock("../lib/api.server", () => ({
  requireMe: async () => ({
    profile: { pseudo: "Orga" },
    memberships: [{ structureSlug: "roues-libres-66", structureId: "st-1", status: "active", role: "owner" }],
  }),
  apiOrThrow: async () => EVENT,
  api: async (_r: Request, path: string) => {
    if (path.includes("/albums")) {
      if (albums === "down")
        return { ok: false as const, status: 503, error: { code: "internal", message: "En panne" } };
      if (albums === "forbidden")
        return { ok: false as const, status: 403, error: { code: "forbidden", message: "Refusé" } };
      const items = albums === "empty" ? [] : [{ id: "a1", official: true, media: { name: "Objectif 66" } }];
      return { ok: true as const, status: 200, data: { items, total: items.length, nextCursor: null } };
    }
    return { ok: false as const, status: 404, error: { code: "not_found", message: "Pas de bilan" } };
  },
}));

const loadApres = async () => {
  const { loader } = await import("./orga-apres");
  return loader({
    request: new Request("http://site.test/orga/roues-libres-66/e/ev-1/apres"),
    params: { structure: "roues-libres-66", eventId: "ev-1" },
  } as never);
};

async function render(loaderData: Awaited<ReturnType<typeof loadApres>>): Promise<string> {
  const { default: OrgaApres } = await import("./orga-apres");
  // L'export par défaut d'une route lit ses données par le routeur : on les lui donne comme à l'hydratation.
  const router = createMemoryRouter(
    [{ id: "apres", path: "/orga/:structure/e/:eventId/apres", Component: OrgaApres as never }],
    { initialEntries: ["/orga/roues-libres-66/e/ev-1/apres"], hydrationData: { loaderData: { apres: loaderData } } },
  );
  return renderToStaticMarkup(createElement(RouterProvider, { router }));
}

beforeAll(async () => {
  await import("./orga-apres");
}, 60_000);
beforeEach(() => {
  albums = "ok";
});

describe("Après l'événement : la ligne « Photos »", () => {
  it("des albums : la ligne et son compte, aucune erreur", async () => {
    const data = await loadApres();
    expect(data.photos).toEqual({ line: "Photos · 1 album · officiel : Objectif 66", failed: false });
    const html = await render(data);
    expect(html).toContain('data-testid="ae-photos-link"');
    expect(html).not.toContain("ae-photos-error");
  });

  it("aucun album : rien, ni ligne ni erreur", async () => {
    albums = "empty";
    const data = await loadApres();
    expect(data.photos).toBeNull();
    const html = await render(data);
    expect(html).not.toContain("ae-photos");
  });

  it("503 : la ligne de gestion reste, compteur inconnu « – », message et « Réessayer »", async () => {
    albums = "down";
    const data = await loadApres();
    expect(data.photos).toEqual({ line: "Photos · –", failed: true });
    const html = await render(data);
    expect(html).toContain('data-testid="ae-photos-link"');
    expect(html).toContain("Photos · –");
    expect(html).toContain("Les albums ne se chargent pas pour le moment.");
    expect(html).toContain('data-testid="ae-photos-retry"');
  });

  it("un refus (403) n'est pas une panne : la ligne n'apparaît pas", async () => {
    albums = "forbidden";
    const data = await loadApres();
    expect(data.photos).toBeNull();
  });
});
