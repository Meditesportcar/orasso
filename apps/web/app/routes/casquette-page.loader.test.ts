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
/** Les lectures refusées (403) plutôt qu'en panne : adresses (début). */
let forbidden: string[] = [];
/** Les listes d'événements dont la page suivante existe : adresses (début) → curseur rendu. */
let cursors: Record<string, string> = {};
/** Les adresses lues par le chargeur (pour vérifier le curseur de départ). */
let asked: string[] = [];

vi.mock("../lib/api.server", () => {
  const answer = (path: string) => {
    if (down.some((d) => path.startsWith(d)))
      return { ok: false as const, status: 503, error: { code: "internal", message: "En panne" } };
    if (forbidden.some((d) => path.startsWith(d)))
      return { ok: false as const, status: 403, error: { code: "two_factor_required", message: "Second facteur" } };
    const cursor = Object.entries(cursors).find(([d]) => path.startsWith(d))?.[1] ?? null;
    const data = path.startsWith("/events?")
      ? { items: cursor ? [event("e-1")] : [], nextCursor: cursor }
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
    api: async (_r: Request, path: string) => {
      asked.push(path);
      return answer(path);
    },
    apiOrThrow: async (_r: Request, path: string) => {
      const res = answer(path);
      if (res.ok) return res.data;
      throw new Response(res.error.message, { status: res.status });
    },
    originOf: () => "http://site.test",
  };
});

const event = (id: string) => ({
  id,
  slug: id,
  title: `Rassemblement ${id}`,
  startsAt: "2026-12-01T09:00:00.000Z",
  endsAt: "2026-12-01T17:00:00.000Z",
  department: "66",
  city: "Perpignan",
  posterUrl: null,
  format: "meet",
  status: "published",
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
  forbidden = [];
  cursors = {};
  asked = [];
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
    // Le compteur des partenaires est inconnu (« – »), jamais « 0 » : l'assertion précédente (« 0 partenaire ») ne pouvait pas échouer.
    expect(html).toMatch(/data-testid="page-count-partners"[^>]*>(?:(?!<\/).)*–/s);
    // « Réessayer » est un lien vers la page courante (sans JavaScript, il la recharge).
    expect(html).toMatch(/<a [^>]*href="\/"[^>]*data-testid="structure-past-error-retry"/);
  });

  it("403 « second facteur » sur le lien d'invitation : un refus n'est pas une panne, pas de « Réessayer » (cas 403)", async () => {
    forbidden = ["/structures/st-1"];
    const data = (await loadPage("?onglet=evenements")) as Record<string, unknown>;
    expect(data.inviteToken).toBeNull();
    expect(data.inviteFailed).toBe(false);
    const html = await render(data as never);
    expect(html).not.toContain("Le lien d&#x27;invitation ne se charge pas");
  });

  it("au-delà des limites (50 à venir, 12 passés) : les curseurs sont transmis et « Voir plus » est proposé", async () => {
    cursors = {
      "/events?structureId=st-1&limit=50": "CURSEUR-A-VENIR",
      "/events?structureId=st-1&scope=past": "CURSEUR-PASSES",
    };
    const data = (await loadPage("?onglet=evenements")) as Record<string, unknown>;
    expect(data.upcomingNext).toBe("CURSEUR-A-VENIR");
    expect(data.pastNext).toBe("CURSEUR-PASSES");
    // Les listes ne sont pas entières : le total des événements reste inconnu.
    expect(data.eventsComplete).toBe(false);
    const html = await render(data as never);
    expect(html).toContain('data-testid="structure-upcoming-more"');
    expect(html).toContain('data-testid="structure-past-more"');
    // Listes entières : pas de « Voir plus ».
    cursors = {};
    const whole = await render((await loadPage("?onglet=evenements")) as never);
    expect(whole).not.toContain("structure-upcoming-more");
    expect(whole).not.toContain("structure-past-more");
  });

  it("une panne des événements ne donne aucun curseur", async () => {
    down = ["/events?structureId=st-1"];
    cursors = { "/events?structureId=st-1": "X" };
    const data = (await loadPage("?onglet=evenements")) as Record<string, unknown>;
    expect(data.upcomingNext).toBeNull();
    expect(data.pastNext).toBeNull();
  });

  it("sans JavaScript : « Voir plus » est un lien, et le chargeur lit la liste à partir du curseur de l'adresse", async () => {
    cursors = { "/events?structureId=st-1&limit=50": "SUITE-A-VENIR" };
    const data = (await loadPage("?onglet=evenements")) as Record<string, unknown>;
    const html = await render(data as never);
    expect(html).toMatch(/<a[^>]*href="[^"]*a-venir=SUITE-A-VENIR[^"]*"[^>]*data-testid="structure-upcoming-more"/);
    expect(html).toContain("onglet=evenements");
    // Le lien suivi : la liste est lue à partir de ce curseur, le total des événements reste inconnu.
    const next = (await loadPage("?onglet=evenements&a-venir=SUITE-A-VENIR&passes=SUITE-PASSES")) as Record<
      string,
      unknown
    >;
    expect(asked).toContain("/events?structureId=st-1&limit=50&cursor=SUITE-A-VENIR");
    expect(asked).toContain("/events?structureId=st-1&scope=past&limit=12&cursor=SUITE-PASSES");
    expect(next.eventsComplete).toBe(false);
  });
});
