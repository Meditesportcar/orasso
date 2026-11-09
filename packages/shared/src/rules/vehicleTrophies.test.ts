import { describe, expect, it } from "vitest";

import { partnerOf, trophiesOf, trophyLine } from "./vehicleTrophies";

// Mardi 10 novembre 2026.
const NOW = new Date("2026-11-10T12:14:00Z");

describe("trophées d'un véhicule", () => {
  it("une ligne : le titre du vote, l'événement et la date (l'année seulement hors année en cours)", () => {
    const line = trophyLine(
      {
        id: "t1",
        voteTitle: "Plus belle japonaise",
        eventTitle: "Rassemblement du Lydia",
        rank: 1,
        awardedAt: "2026-11-10T22:00:00Z",
      },
      NOW,
    );
    expect(line).toEqual({
      id: "t1",
      title: "Plus belle japonaise",
      sub: "Rassemblement du Lydia · 10 nov.",
      rank: "1er",
      first: true,
    });
    const old = trophyLine(
      {
        id: "t2",
        voteTitle: "Toutes catégories",
        eventTitle: "Salon Argelès",
        rank: 3,
        awardedAt: "2025-10-27T18:00:00Z",
      },
      NOW,
    );
    expect(old.sub).toBe("Salon Argelès · 27 oct. 2025");
    expect(old.rank).toBe("3e");
    expect(old.first).toBe(false);
  });

  it("lit les trophées d'une réponse qui n'en sert pas (cache d'avant) sans jamais lever d'erreur", () => {
    expect(trophiesOf({})).toEqual([]);
    expect(trophiesOf(null)).toEqual([]);
    expect(trophiesOf({ trophies: "x" })).toEqual([]);
    const mixed = {
      trophies: [{ id: 1 }, null, { id: "a", voteTitle: "V", eventTitle: "E", rank: 1, awardedAt: "x" }],
    };
    expect(trophiesOf(mixed)).toHaveLength(1);
  });

  it("le partenaire s'affiche seulement si l'API le renvoie", () => {
    expect(partnerOf({})).toBeNull();
    expect(partnerOf({ partner: null })).toBeNull();
    expect(partnerOf({ partner: { name: " " } })).toBeNull();
    expect(partnerOf({ partner: { name: "Wrap 66", logoUrl: null, slug: "wrap-66" } })).toEqual({
      name: "Wrap 66",
      slug: "wrap-66",
      title: "Partenaire : Wrap 66",
    });
    expect(partnerOf({ partner: { name: "Wrap 66" } })?.slug).toBeNull();
  });
});
