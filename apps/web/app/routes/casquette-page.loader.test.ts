// La Page du propriétaire d'une structure (lot R9h partie 2, tour 4) : une lecture qui échoue (503) n'est jamais une absence. Les événements à
// venir, passés et les pros partenaires d'une panne restent `null` (l'écran dit la panne avec « Réessayer », les compteurs restent
// inconnus : « – »), jamais « Aucun événement à venir » ni « 0 partenaire » ; le lien d'invitation dit aussi sa panne.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const PAGE = {
  id: "st-1",
  slug: "roues-libres-66",
  name: "Roues Libres 66",
  kind: "association",
  postalCode: "66000",
  city: "Perpignan",
  description: "",
  website: null,
  socials: {},
  logoUrl: null,
  followersCount: 2,
  rating: { average: null, count: 0 },
  stories: null,
  partners: [],
};
/** Les lectures de la panne : les adresses (début) qui répondent 503. */
let down: string[] = [];

vi.mock("../lib/api.server", () => {
  const answer = (path: string) => {
    if (down.some((d) => path.startsWith(d)))
      return { ok: false as const, status: 503, error: { code: "internal", message: "En panne" } };
    const data = path.startsWith("/events?")
      ? { items: [], nextCursor: null }
      : path.endsWith("/pros")
        ? []
        : path.startsWith("/structures/st-1")
          ? { ...PAGE, inviteToken: "tok" }
          : PAGE;
    return { ok: true as const, status: 200, data };
  };
  return {
    requireMe: async () => ({
      user: { id: "u1" },
      personas: [],
      memberships: [{ structureSlug: "roues-libres-66", status: "active", role: "owner" }],
    }),
    api: async (_r: Request, path: string) => answer(path),
    apiOrThrow: async (_r: Request, path: string) => {
      const res = answer(path);
      if (res.ok) return res.data;
      throw new Response(res.error.message, { status: res.status });
    },
    originOf: () => "http://site.test",
  };
});

const loadPage = async (query = "") => {
  const { loader } = await import("./casquette-page");
  return loader({
    request: new Request(`http://site.test/orga/roues-libres-66/page${query}`),
    params: { structure: "roues-libres-66" },
  } as never);
};

beforeAll(async () => {
  await Promise.all([import("./casquette-page"), import("../components/pages/OwnerPage")]);
}, 60_000);
beforeEach(() => {
  down = [];
});

/** L'onglet « Événements » rendu comme le site le rend, avec ce que le chargeur a lu. */
async function render(data: Awaited<ReturnType<typeof loadPage>>): Promise<string> {
  const { OwnerPage } = await import("../components/pages/OwnerPage");
  const router = createMemoryRouter([
    { path: "/", element: createElement(OwnerPage, { data: data as Parameters<typeof OwnerPage>[0]["data"] }) },
  ]);
  return renderToStaticMarkup(createElement(RouterProvider, { router }));
}

describe("chargeur de la Page d'une structure", () => {
  it("nominal : listes lues, compteurs connus, aucune panne", async () => {
    const data = (await loadPage("?onglet=evenements")) as Record<string, unknown>;
    expect(data.upcoming).toEqual([]);
    expect(data.past).toEqual([]);
    expect(data.partners).toEqual([]);
    expect(data.inviteFailed).toBe(false);
    const html = await render(data as never);
    expect(html).not.toContain("ne se chargent pas");
    expect(html).toContain("Aucun événement à venir pour l");
  });

  it("503 sur les événements à venir : `null`, message et « Réessayer », compteur « – », jamais « Aucun événement »", async () => {
    down = ["/events?structureId=st-1&limit=50"];
    const data = (await loadPage("?onglet=evenements")) as Record<string, unknown>;
    expect(data.upcoming).toBeNull();
    const html = await render(data as never);
    expect(html).toContain("Les événements ne se chargent pas pour le moment.");
    expect(html).toContain("Réessayer");
    expect(html).not.toContain("Aucun événement à venir");
    expect(html).toMatch(/data-testid="page-count-events"[^>]*>(?:(?!<\/).)*–/s);
  });

  it("503 sur les événements passés, les pros partenaires et le lien d'invitation : chacun le dit", async () => {
    down = [
      "/events?structureId=st-1&scope=past",
      "/structures/roues-libres-66/pros",
      "/structures/by-slug/roues-libres-66/pros",
      "/structures/st-1",
    ];
    const data = (await loadPage("?onglet=evenements")) as Record<string, unknown>;
    expect(data.past).toBeNull();
    expect(data.partners).toBeNull();
    expect(data.inviteFailed).toBe(true);
    const html = await render(data as never);
    expect(html).toContain("Les événements passés ne se chargent pas pour le moment.");
    expect(html).toContain("Les pros partenaires ne se chargent pas pour le moment.");
    expect(html).toContain("Le lien d&#x27;invitation ne se charge pas pour le moment.");
    expect(html).not.toMatch(/\b0 partenaire/);
  });
});
