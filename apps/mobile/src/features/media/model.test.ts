import type { MediaAgenda, MediaContentView } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import {
  agendaState,
  cardState,
  contentCaption,
  daysUntil,
  defaultSearchFilters,
  detailLine,
  groupByEvent,
  guessPlatform,
  hostOf,
  monthRange,
  normalizeUrl,
  searchQuery,
  splitAgenda,
  totalViews,
  weekStartOf,
  weekStrip,
} from "./model";

// Mercredi 21 octobre 2026, 10 h à Paris.
const NOW = new Date("2026-10-21T08:00:00Z");

describe("recherche de l'Explorer média", () => {
  it("par défaut : toute la France, par date, accréditation ouverte", () => {
    expect(searchQuery("", defaultSearchFilters, NOW, "list")).toMatchObject({
      region: undefined,
      accreditationOpen: "1",
      sort: "date",
      limit: 20,
    });
  });
  it("région, format et ce mois-ci sont transmis ; la carte charge 100 événements", () => {
    const q = searchQuery(
      " cars ",
      { region: "OCC", format: "gathering", thisMonth: true, openOnly: false },
      NOW,
      "map",
      "c1",
    );
    expect(q).toMatchObject({ q: "cars", region: "OCC", format: "gathering", limit: 100, cursor: "c1" });
    expect(q.accreditationOpen).toBeUndefined();
    expect(q.from).toBe(NOW.toISOString());
    expect(q.to).toBe("2026-10-31T22:59:00.000Z");
  });
  it("ce mois-ci en décembre court jusqu'au 31", () => {
    expect(monthRange(new Date("2026-12-10T10:00:00Z")).to).toBe("2026-12-31T22:59:00.000Z");
  });
});

describe("état d'une carte", () => {
  it("la mienne d'abord, sinon demander si c'est ouvert", () => {
    expect(cardState({ open: true, mine: "accepted" })).toBe("accredited");
    expect(cardState({ open: false, mine: "pending" })).toBe("pending");
    expect(cardState({ open: true, mine: "refused" })).toBe("refused");
    expect(cardState({ open: true, mine: null })).toBe("request");
    expect(cardState({ open: false, mine: null })).toBe("closed");
    expect(cardState(undefined)).toBe("closed");
    // Une demande retirée ne bloque pas une nouvelle demande.
    expect(cardState({ open: true, mine: "cancelled" })).toBe("request");
  });
  it("ligne de détail : département, ville, format, temps de route estimé", () => {
    expect(detailLine({ department: "31", city: "Toulouse", format: "gathering", travelMinutes: 180 })).toBe(
      "31 · Toulouse · Rassemblement · ≈ 3 h de route",
    );
    expect(detailLine({ department: "66", city: null, format: "exhibition", travelMinutes: null })).toBe(
      "66 · Exposition",
    );
  });
});

const brief = (startsAt: string, endsAt = startsAt) => ({
  id: startsAt,
  slug: "x",
  title: "X",
  format: "gathering" as const,
  startsAt,
  endsAt,
  city: null,
  department: null,
  structureName: "S",
});

describe("Mon agenda", () => {
  const agenda: MediaAgenda = {
    weeks: [
      {
        weekStart: "2026-10-19",
        items: [
          {
            event: brief("2026-10-24T17:00:00Z", "2026-10-24T21:00:00Z"),
            accreditation: { id: "a", status: "accepted" },
            saved: false,
            accreditationOpen: true,
          },
        ],
      },
      {
        weekStart: "2026-10-26",
        items: [
          {
            event: brief("2026-10-31T17:00:00Z"),
            accreditation: null,
            saved: true,
            accreditationOpen: true,
          },
        ],
      },
    ],
  };
  it("lundi de la semaine en heure de Paris", () => {
    expect(weekStartOf(NOW)).toBe("2026-10-19");
    expect(weekStartOf(new Date("2026-10-25T23:30:00Z"))).toBe("2026-10-26");
  });
  it("la bande de sept jours marque ceux où un événement a lieu", () => {
    const strip = weekStrip(NOW, agenda);
    expect(strip).toHaveLength(7);
    expect(strip.map((d) => d.day)).toEqual([19, 20, 21, 22, 23, 24, 25]);
    expect(strip.filter((d) => d.covered).map((d) => d.day)).toEqual([24]);
    expect(weekStrip(NOW, null).some((d) => d.covered)).toBe(false);
  });
  it("cette semaine / plus tard ; une ligne gardée propose de demander", () => {
    const { thisWeek, later } = splitAgenda(agenda, NOW);
    expect(thisWeek).toHaveLength(1);
    expect(later).toHaveLength(1);
    expect(agendaState(thisWeek[0] as never)).toBe("accredited");
    expect(agendaState(later[0] as never)).toBe("request");
  });
  it("jours avant l'événement", () => {
    expect(daysUntil("2026-10-27T17:00:00Z", NOW)).toBe(6);
    expect(daysUntil("2026-10-21T20:00:00Z", NOW)).toBe(0);
  });
});

const content = (over: Partial<MediaContentView>): MediaContentView => ({
  id: "c",
  eventId: "e1",
  event: { id: "e1", slug: "nocturne", title: "Nocturne", startsAt: "2026-10-24T17:00:00Z" },
  kind: "link",
  title: "Titre",
  url: "https://www.sudcars.fr/nuit",
  platform: "website",
  photos: [],
  featured: false,
  views: 610,
  publishedAt: "2026-10-25T10:00:00Z",
  media: { id: "m", name: "Sud Cars", logoUrl: null },
  ...over,
});

describe("contenus", () => {
  it("groupés par événement, les mis en avant repérés, vues cumulées", () => {
    const list = [
      content({ id: "1", featured: true, views: 460 }),
      content({ id: "2" }),
      content({ id: "3", eventId: "e2", event: { id: "e2", slug: "b", title: "B", startsAt: "2026-08-29T17:00:00Z" } }),
    ];
    const groups = groupByEvent(list);
    expect(groups.map((g) => g.event.id)).toEqual(["e1", "e2"]);
    expect(groups[0]?.featured.map((c) => c.id)).toEqual(["1"]);
    expect(totalViews(list)).toBe(460 + 610 + 610);
  });
  it("légende : hôte du lien, plateforme, nombre de photos", () => {
    expect(contentCaption(content({}))).toBe("sudcars.fr · 610 vues");
    expect(contentCaption(content({ platform: "youtube", url: "https://youtu.be/x", views: 1 }))).toBe(
      "YouTube · 1 vue",
    );
    expect(contentCaption(content({ kind: "gallery", url: null, photos: [{ key: "k", url: "u" }], views: 0 }))).toBe(
      "1 photo · 0 vue",
    );
  });
  it("adresses : https ajouté, plateforme devinée", () => {
    expect(normalizeUrl(" sudcars.fr/nuit ")).toBe("https://sudcars.fr/nuit");
    expect(normalizeUrl("http://a.fr")).toBe("http://a.fr");
    expect(normalizeUrl("  ")).toBeNull();
    expect(hostOf("https://www.sudcars.fr/a?b")).toBe("sudcars.fr");
    expect(guessPlatform("https://www.youtube.com/watch?v=1")).toBe("youtube");
    expect(guessPlatform("https://instagram.com/p/1")).toBe("instagram");
    expect(guessPlatform("https://sudcars.fr")).toBe("website");
  });
});
