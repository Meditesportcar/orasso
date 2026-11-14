// Lot B2b, tour 4 : la panne d'une relecture de la page se dit quelle que soit la longueur de la liste gardée (vide comprise) ;
// « Aucun événement » ne se dit jamais en même temps qu'une panne. Le crochet est remplacé par des vues données : le rendu suit.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";

type View = { items: unknown[] | null; next: string | null; readFailed: boolean; failed: boolean; busy: boolean };
const views: { upcoming: View; past: View } = {
  upcoming: { items: [], next: null, readFailed: false, failed: false, busy: false },
  past: { items: [], next: null, readFailed: false, failed: false, busy: false },
};
vi.mock("./useMoreEvents", () => ({
  useMoreEvents: (_id: string, scope: "upcoming" | "past") => ({ ...views[scope], more: async () => undefined }),
}));

import { StructureEvents } from "./StructureEvents";

const STRUCTURE = {
  id: "st-1",
  slug: "roues-libres-66",
  name: "Roues Libres 66",
  kind: "association",
  postalCode: "66000",
  city: "Perpignan",
  description: "",
  website: null,
  socials: {},
  rating: { average: null, count: 0 },
};

function render(search = ""): string {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: createElement(StructureEvents, {
          structure: STRUCTURE as never,
          upcoming: [],
          upcomingNext: null,
          past: [],
          pastNext: null,
          partners: [],
          inviteToken: null,
          inviteFailed: false,
          origin: "http://site.test",
        }),
      },
    ],
    { initialEntries: [`/${search}`] },
  );
  return renderToStaticMarkup(createElement(RouterProvider, { router }));
}

const set = (scope: "upcoming" | "past", patch: Partial<View>) => {
  views[scope] = { ...views[scope], ...patch };
};

describe("liste vide gardée, relecture en panne, reprise", () => {
  it("passés : vide lue → panne de relecture dite avec « Réessayer » → reprise : rien (liste vide)", () => {
    set("past", { items: [], readFailed: false });
    expect(render()).not.toContain("so-past");
    set("past", { items: [], readFailed: true });
    const html = render();
    expect(html).toContain('data-testid="structure-past-reread-error"');
    expect(html).toContain('data-testid="structure-past-reread-error-retry"');
    set("past", { items: [], readFailed: false });
    expect(render()).not.toContain("structure-past-reread-error");
  });

  it("passés vides partis d'un curseur : « Revoir depuis le début » ; avec la panne, la panne seule", () => {
    set("past", { items: [], readFailed: false });
    expect(render("?passes=X")).toContain("structure-past-from-start");
    set("past", { items: [], readFailed: true });
    const html = render("?passes=X");
    expect(html).toContain("structure-past-reread-error");
    expect(html).not.toContain("structure-past-from-start");
  });

  it("à venir : vide lue → panne : la panne seule, jamais « Aucun événement à venir » → reprise : « Aucun événement »", () => {
    set("upcoming", { items: [], readFailed: false });
    expect(render()).toContain("Aucun événement à venir");
    set("upcoming", { items: [], readFailed: true });
    const html = render();
    expect(html).toContain('data-testid="structure-upcoming-reread-error"');
    expect(html).toContain("structure-upcoming-reread-error-retry");
    expect(html).not.toContain("Aucun événement à venir");
    set("upcoming", { items: [], readFailed: false });
    const back = render();
    expect(back).toContain("Aucun événement à venir");
    expect(back).not.toContain("structure-upcoming-reread-error");
  });

  it("à venir vide parti d'un curseur : avec la panne, ni « Revoir depuis le début » ni « Aucun événement »", () => {
    set("upcoming", { items: [], readFailed: true });
    const html = render("?a-venir=X");
    expect(html).toContain("structure-upcoming-reread-error");
    expect(html).not.toContain("structure-upcoming-from-start");
  });
});
