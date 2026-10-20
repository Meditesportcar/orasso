import { type PassportStamp, passportPages, stampShapes } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import { inkTokenKey, PAGE_BOX, silhouetteOf, stampLook, stampPlacement, stampShapeArt, stampText } from "./stampModel";

// Tampons du passeport (lot 50) : le dessin est déterministe (même `seed`, même tampon) et chaque forme a le sien.
const stamp = (over: Partial<PassportStamp> = {}): PassportStamp => ({
  id: "s1",
  kind: "participation",
  shape: "octagon",
  ink: "66",
  seed: 1234,
  rare: false,
  stampedAt: "2026-10-24T18:00:00.000Z",
  event: {
    id: "e1",
    slug: "nocturne-de-canet",
    title: "Nocturne de Canet",
    format: "night",
    startsAt: "2026-10-24T17:00:00.000Z",
    city: "Canet",
    department: "66",
  },
  ...over,
});

describe("usure d'un tampon", () => {
  it("est la même pour la même seed, différente d'une seed à l'autre", () => {
    expect(stampLook(1234)).toEqual(stampLook(1234));
    expect(stampLook(1234)).not.toEqual(stampLook(1235));
  });

  it("reste dans les bornes : angle ±14°, pression 70 à 100 %, bavure légère", () => {
    for (let seed = 0; seed < 10_000; seed += 37) {
      const look = stampLook(seed);
      expect(Math.abs(look.angle)).toBeLessThanOrEqual(14);
      expect(look.opacity).toBeGreaterThanOrEqual(0.7);
      expect(look.opacity).toBeLessThanOrEqual(1);
      expect(Math.abs(look.bleed.x)).toBeLessThanOrEqual(1.5);
      expect(look.bleed.scale).toBeGreaterThanOrEqual(1.03);
      expect(look.bleed.scale).toBeLessThanOrEqual(1.06);
      for (const s of look.specks) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x).toBeLessThanOrEqual(120);
      }
    }
  });

  it("use d'autant plus le tampon que la pression est faible", () => {
    const worn = Array.from({ length: 200 }, (_, i) => stampLook(i * 49)).sort((a, b) => a.opacity - b.opacity);
    expect(worn[0]?.specks.length).toBeGreaterThan(worn[worn.length - 1]?.specks.length ?? 0);
  });
});

describe("formes", () => {
  it("chacune des quatre formes et l'étoile des rares ont leur dessin", () => {
    const outlines = [...stampShapes, "star" as const].map((s) => stampShapeArt(s).strokes[0]?.d);
    expect(new Set(outlines).size).toBe(5);
  });

  it("un rare est une étoile quelle que soit la forme de son format", () => {
    expect(silhouetteOf({ shape: "round", rare: true })).toBe("star");
    expect(silhouetteOf({ shape: "cup", rare: false })).toBe("cup");
  });

  it("l'octogone porte sa lune, l'anneau suit les formes rondes", () => {
    expect(stampShapeArt("octagon").fills).toHaveLength(1);
    expect(stampShapeArt("round").ring).toBe(true);
    expect(stampShapeArt("rect").ring).toBe(false);
    expect(stampShapeArt("cup").ring).toBe(false);
  });
});

describe("texte et encre", () => {
  it("titre en capitales, date jj.mm dans le fuseau de Paris, département sur l'anneau", () => {
    const text = stampText(stamp());
    expect(text.title).toBe("NOCTURNE DE CANET");
    expect(text.date).toBe("24.10");
    expect(text.year).toBe("2026");
    expect(text.ring).toBe("NOCTURNE DE CANET · 66 ·");
  });

  it("un rare porte le nom de son genre, un titre long est coupé sur la ligne mais pas sur l'anneau", () => {
    expect(stampText(stamp({ kind: "first_outing", rare: true })).title).toBe("PREMIÈRE SORTIE");
    expect(stampText(stamp({ kind: "first_outing", rare: true })).year).toBe("RARE");
    const long = stamp({ event: { ...stamp().event, title: "Rassemblement des passionnés de Collioure" } });
    expect(stampText(long).short).toBe("RASSEMBLEMENT DES .");
    expect(stampText(long).ring).toContain("RASSEMBLEMENT DES PASSIONNÉS DE COLLIOURE");
  });

  it("l'encre est le jeton du département, ou celui par défaut", () => {
    expect(inkTokenKey("66")).toBe("stampInk66");
    expect(inkTokenKey("default")).toBe("stampInkDefault");
  });
});

describe("pages", () => {
  it("huit tampons par page, les emplacements restent dans le cadre et changent avec la seed", () => {
    const pages = passportPages(Array.from({ length: 9 }, (_, i) => i));
    expect(pages.map((p) => p.length)).toEqual([8, 1]);
    for (let i = 0; i < 8; i++) {
      const spot = stampPlacement(i, 4321);
      expect(spot.x).toBeGreaterThanOrEqual(0);
      expect(spot.x + spot.size).toBeLessThanOrEqual(PAGE_BOX.width + 8);
      expect(spot.y + spot.size).toBeLessThanOrEqual(PAGE_BOX.height);
    }
    expect(stampPlacement(0, 1)).toEqual(stampPlacement(0, 1));
    expect(stampPlacement(0, 1)).not.toEqual(stampPlacement(0, 2));
  });
});
