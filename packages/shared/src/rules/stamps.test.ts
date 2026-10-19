import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { eventFormats } from "../enums";
import { stampSentence } from "../labels/passport.fr";
import {
  isRare,
  PASSPORT_PAGE_SIZE,
  passportPages,
  STAMP_INK_DEPARTMENTS,
  stampInk,
  stampInkToken,
  stampKinds,
  stampSeed,
  stampShape,
  stampWear,
} from "./stamps";

describe("tampons du passeport", () => {
  it("la forme suit le format (prototype s-passport)", () => {
    expect(stampShape("gathering")).toBe("round");
    expect(stampShape("exhibition")).toBe("rect");
    expect(stampShape("night")).toBe("octagon");
    expect(stampShape("cars_and_coffee")).toBe("cup");
    expect(stampShape("show")).toBe("rect");
    expect(stampShape("open_house")).toBe("rect");
    for (const f of eventFormats) expect(["round", "rect", "octagon", "cup"]).toContain(stampShape(f));
  });

  it("l'encre suit le département, sinon l'encre par défaut", () => {
    expect(stampInk("66")).toBe("66");
    expect(stampInk("34")).toBe("34");
    expect(stampInk("13")).toBe("default");
    expect(stampInk(null)).toBe("default");
    expect(stampInk(undefined)).toBe("default");
    expect(stampInkToken("66")).toBe("stamp-ink-66");
    expect(stampInkToken("default")).toBe("stamp-ink-default");
  });

  it("les encres sont exactement celles des jetons v2 (tokens.v2.json, lot 38)", () => {
    const tokens = JSON.parse(
      readFileSync(new URL("../../../design-system/tokens.v2.json", import.meta.url), "utf8"),
    ) as { added: { "stamp-ink": { department: string }[] } };
    const inks = tokens.added["stamp-ink"].map((e) => e.department).sort();
    expect(inks).toEqual([...STAMP_INK_DEPARTMENTS].sort());
  });

  it("aléa d'usure déterministe, entre 0 et 9999, différent d'un genre à l'autre", () => {
    const a = stampSeed("user-1", "event-1");
    expect(stampSeed("user-1", "event-1")).toBe(a);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(10_000);
    expect(stampSeed("user-1", "event-1", "full_moon")).not.toBe(a);
    const seeds = new Set(Array.from({ length: 200 }, (_, i) => stampSeed(`u${i}`, "e")));
    expect(seeds.size).toBeGreaterThan(180);
    const w = stampWear(a);
    expect(w.angle).toBeGreaterThanOrEqual(-14);
    expect(w.angle).toBeLessThanOrEqual(14);
    expect(w.pressure).toBeGreaterThanOrEqual(0.62);
    expect(w.pressure).toBeLessThanOrEqual(1);
    expect(w.smudge).toBeGreaterThanOrEqual(0);
    expect(w.smudge).toBeLessThanOrEqual(1);
  });

  it("les rares : première sortie, 10e événement, pleine lune, prix du public", () => {
    expect(stampKinds.filter(isRare)).toEqual(["first_outing", "tenth_event", "full_moon", "audience_prize"]);
  });

  it("pages de 8, une page vide sans tampon", () => {
    expect(PASSPORT_PAGE_SIZE).toBe(8);
    expect(passportPages([])).toEqual([[]]);
    expect(passportPages(Array.from({ length: 9 }, (_, i) => i)).map((p) => p.length)).toEqual([8, 1]);
  });

  it("phrase du récap générée depuis la forme et l'encre (prototype s-recap)", () => {
    expect(stampSentence({ kind: "participation", format: "night", ink: "66", department: "66" })).toBe(
      "Nouveau tampon de nuit dans ton passeport, encre sang et or du 66.",
    );
    expect(stampSentence({ kind: "participation", format: "gathering", ink: "default", department: "13" })).toBe(
      "Nouveau tampon de rassemblement dans ton passeport, encre rouge du 13.",
    );
    expect(stampSentence({ kind: "first_outing", format: "night", ink: "66", department: "66" })).toBe(
      "Nouveau tampon rare dans ton passeport : première sortie, en dorure.",
    );
  });
});
