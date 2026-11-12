import { describe, expect, it } from "vitest";

import type { MentionItem } from "../schemas/feedLists";

import {
  aspectOfPhotos,
  explicitPageFilter,
  explicitPageTab,
  isPageManager,
  mentionLine,
  pageCounters,
  pageEmptyText,
  pageFilterSlug,
  pageOpenTab,
  pageShownTab,
  pageTabs,
} from "./publicPage";

const ids = (kind: "structure" | "pro", session: boolean, mentionsCount?: number | null) =>
  pageTabs(kind, { session, mentionsCount }).map((t) => t.id);

describe("pageTabs : les onglets d'une page", () => {
  it("structure : Événements, Publications, Mentions · N", () => {
    expect(ids("structure", true, 2)).toEqual(["events", "publications", "mentions"]);
    const items = pageTabs("structure", { session: true, mentionsCount: 2 });
    expect(items.map((t) => t.label)).toEqual(["Événements", "Publications", "Mentions"]);
    expect(items[2]?.count).toBe(2);
  });
  it("pro (R9c) : Présentation, Publications, Offres, Mentions · N", () => {
    expect(ids("pro", true, 0)).toEqual(["presentation", "publications", "offers", "mentions"]);
    const items = pageTabs("pro", { session: true, mentionsCount: 0 });
    expect(items.map((t) => t.label)).toEqual(["Présentation", "Publications", "Offres", "Mentions"]);
    expect(items[3]?.count).toBe(0);
    expect(items[2]?.count).toBeNull();
  });
  it("R9c : une structure n'a pas d'onglet « Offres » ; sans session, un pro non plus (ni Publications ni Mentions)", () => {
    expect(ids("structure", true, 1)).not.toContain("offers");
    expect(ids("pro", false)).not.toContain("offers");
  });
  it("R9c : `?onglet=offres` ouvre l'onglet pour un pro avec session, est ignoré sinon", () => {
    expect(pageShownTab("pro", { raw: "offres", counts: { publications: 0 }, session: true })).toBe("offers");
    expect(pageShownTab("pro", { raw: "offres", counts: { publications: 0 }, session: false })).toBe("presentation");
    expect(pageShownTab("structure", { raw: "offres", counts: { publications: 2 }, session: true })).toBe(
      "publications",
    );
  });
  it("sans session : pas de « Mentions » ; un pro n'a pas non plus de « Publications »", () => {
    expect(ids("structure", false)).toEqual(["events", "publications"]);
    expect(ids("pro", false)).toEqual(["presentation"]);
  });
  it("un nombre de mentions inconnu n'écrit jamais « · 0 »", () => {
    expect(pageTabs("structure", { session: true })[2]?.count).toBeNull();
    expect(pageTabs("structure", { session: true, mentionsCount: null })[2]?.count).toBeNull();
  });
});

describe("pageOpenTab : l'onglet d'ouverture", () => {
  it("« Publications » par défaut", () => {
    expect(pageOpenTab("structure", { publications: 3 }, true)).toBe("publications");
    expect(pageOpenTab("structure", { publications: 3 }, false)).toBe("publications");
    expect(pageOpenTab("pro", { publications: 1 }, true)).toBe("publications");
  });
  it("sans aucune publication : « Événements » (structure) ou « Présentation » (pro)", () => {
    expect(pageOpenTab("structure", { publications: 0 }, true)).toBe("events");
    expect(pageOpenTab("structure", { publications: 0 }, false)).toBe("events");
    expect(pageOpenTab("pro", { publications: 0 }, true)).toBe("presentation");
  });
  it("zéro mention ne change rien : seules les publications comptent", () => {
    expect(pageOpenTab("structure", { publications: 2, mentions: 0 }, true)).toBe("publications");
    expect(pageOpenTab("structure", { publications: 0, mentions: 5 }, true)).toBe("events");
  });
  it("un pro vu sans session s'ouvre sur « Présentation », même avec un nombre de publications", () => {
    expect(pageOpenTab("pro", { publications: 4 }, false)).toBe("presentation");
  });
  it("compteur inconnu (réponse plus ancienne) : l'onglet de la fiche d'hier", () => {
    expect(pageOpenTab("structure", {}, true)).toBe("events");
    expect(pageOpenTab("pro", {}, true)).toBe("presentation");
  });
});

describe("explicitPageTab et pageShownTab : l'adresse", () => {
  it("lit ?onglet= quand la page propose l'onglet", () => {
    expect(explicitPageTab("structure", "evenements", true)).toBe("events");
    expect(explicitPageTab("structure", "mentions", true)).toBe("mentions");
    expect(explicitPageTab("pro", "presentation", false)).toBe("presentation");
  });
  it("ignore un paramètre invalide ou un onglet absent de la page", () => {
    expect(explicitPageTab("structure", "garage", true)).toBeNull();
    expect(explicitPageTab("structure", "mentions", false)).toBeNull();
    expect(explicitPageTab("pro", "publications", false)).toBeNull();
    expect(explicitPageTab("pro", "evenements", true)).toBeNull();
    expect(explicitPageTab("structure", undefined, true)).toBeNull();
  });
  it("l'adresse l'emporte sur l'ouverture", () => {
    expect(pageShownTab("structure", { raw: "evenements", counts: { publications: 5 }, session: true })).toBe("events");
    expect(pageShownTab("structure", { raw: "x", counts: { publications: 5 }, session: true })).toBe("publications");
  });
});

describe("le filtre des publications", () => {
  it("lit ?filtre= ; « Tout » par défaut", () => {
    expect(explicitPageFilter("evenements")).toBe("event");
    expect(explicitPageFilter("hors-evenement")).toBe("no_event");
    expect(explicitPageFilter("tout")).toBe("all");
    expect(explicitPageFilter(undefined)).toBe("all");
    expect(explicitPageFilter("autre chose")).toBe("all");
  });
  it("le mot de l'adresse revient au même filtre", () => {
    for (const f of ["all", "event", "no_event"] as const) expect(explicitPageFilter(pageFilterSlug(f))).toBe(f);
  });
  it("l'état vide dit le nom de la page, ou le filtre", () => {
    expect(pageEmptyText("all", "Roues Libres 66")).toBe("Roues Libres 66 n'a rien publié pour l'instant.");
    expect(pageEmptyText("event", "x")).toContain("rattachée");
    expect(pageEmptyText("no_event", "x")).toContain("en dehors");
  });
});

describe("pageCounters : la bande", () => {
  it("structure : abonnés, événements, partenaires", () => {
    const cells = pageCounters("structure", { followers: 412, events: 9, partners: 3 });
    expect(cells.map((c) => [c.value, c.label])).toEqual([
      [412, "abonnés"],
      [9, "événements"],
      [3, "partenaires"],
    ]);
  });
  it("structure : un nombre non lu garde sa case (« – ») et l'accord du pluriel", () => {
    const cells = pageCounters("structure", { followers: 1, events: null });
    expect(cells.map((c) => [c.key, c.value, c.label])).toEqual([
      ["followers", 1, "abonné"],
      ["events", null, "événements"],
      ["partners", null, "partenaires"],
    ]);
  });
  it("pro : deux compteurs, les autres seulement quand la donnée existe", () => {
    expect(pageCounters("pro", { followers: 286 }).map((c) => c.key)).toEqual(["followers"]);
    expect(pageCounters("pro", { followers: 286, partners: 4, organizers: 2 }).map((c) => c.key)).toEqual([
      "followers",
      "partners",
      "organizers",
    ]);
    expect(pageCounters("pro", { followers: 2, partners: 0, organizers: 0 }).map((c) => c.key)).toEqual(["followers"]);
  });
});

describe("isPageManager : qui peut « Masquer de la page »", () => {
  const m = (role: string, status = "active", structureId = "s1") => ({ structureId, role, status });
  it("structure : un membre actif qui n'est pas staff, de cette structure", () => {
    expect(isPageManager("structure", { structureId: "s1", memberships: [m("owner")] })).toBe(true);
    expect(isPageManager("structure", { structureId: "s1", memberships: [m("co_organizer")] })).toBe(true);
    expect(isPageManager("structure", { structureId: "s1", memberships: [m("staff")] })).toBe(false);
    expect(isPageManager("structure", { structureId: "s1", memberships: [m("owner", "invited")] })).toBe(false);
    expect(isPageManager("structure", { structureId: "s1", memberships: [m("owner", "active", "s2")] })).toBe(false);
    expect(isPageManager("structure", { structureId: "s1" })).toBe(false);
  });
  it("pro : le propriétaire de la fiche", () => {
    expect(isPageManager("pro", { isOwner: true })).toBe(true);
    expect(isPageManager("pro", { isOwner: false })).toBe(false);
    expect(isPageManager("pro", {})).toBe(false);
  });
});

describe("mentionLine : la ligne d'une mention", () => {
  const post = (attach: unknown) => ({ attach }) as unknown as MentionItem["post"];
  const attach = (role: "on_site" | "attendee" | "organizer" | null, phase: "before" | "running" | "after") => ({
    event: { id: "e", slug: "lydia", title: "Rassemblement du Lydia", startsAt: "", endsAt: "", city: null },
    role,
    phase,
    presenceValidated: true,
  });
  it("un rattachement avec verbe", () => {
    expect(mentionLine({ post: post(attach("attendee", "after")), source: "attach", hidden: false }, "RL66").text).toBe(
      "était au Rassemblement du Lydia",
    );
    expect(mentionLine({ post: post(attach("on_site", "after")), source: "attach", hidden: false }, "RL66").text).toBe(
      "présent au Rassemblement du Lydia",
    );
  });
  it("une collaboration commerciale : la pastille, pas de phrase", () => {
    expect(mentionLine({ post: post(null), source: "commercial", hidden: false }, "ATD")).toEqual({
      text: "",
      commercial: true,
    });
  });
  it("une citation, ou un rattachement sans verbe : « a cité <la page> »", () => {
    expect(mentionLine({ post: post(null), source: "caption", hidden: false }, "Objectif 66").text).toBe(
      "a cité Objectif 66",
    );
    expect(mentionLine({ post: post(attach(null, "after")), source: "attach", hidden: false }, "RL66").text).toBe(
      "a cité RL66",
    );
  });
});

describe("aspectOfPhotos : le cadrage d'une publication sans session", () => {
  it("le format le plus proche de la première photo", () => {
    expect(aspectOfPhotos([{ width: 1080, height: 1350 }])).toBe("portrait_4_5");
    expect(
      aspectOfPhotos([
        { width: 1080, height: 1080 },
        { width: 1080, height: 1350 },
      ]),
    ).toBe("square");
    expect(aspectOfPhotos([{ width: 1350, height: 1080 }])).toBe("landscape");
    expect(aspectOfPhotos([])).toBe("portrait_4_5");
  });
});
