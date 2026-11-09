// Chaque genre de carte que l'API produit a une carte dans le registre (ou `UnknownCard`) : lu dans le source, parce que les
// cartes importent React Native et ne se chargent pas sous Vitest.
import { readFileSync } from "node:fs";
import { feedCardKinds, isFeedKindReserved } from "@orasso/shared";
import { describe, expect, it } from "vitest";

const dir = new URL(".", import.meta.url);
const registry = readFileSync(new URL("index.ts", dir), "utf8");
const entries = new Map(
  [...registry.matchAll(/^\s{2}([a-z_]+):\s*([A-Za-z]+),$/gm)].map((m) => [m[1] as string, m[2] as string]),
);

describe("registre des cartes du Fil", () => {
  it("un genre de l'API, une carte", () => {
    for (const kind of feedCardKinds) expect(entries.get(kind), kind).toBeTruthy();
    expect(entries.size).toBe(feedCardKinds.length);
  });
  it("chaque carte a son fichier, un par genre", () => {
    for (const name of new Set(entries.values())) {
      expect(() => readFileSync(new URL(`${name}.tsx`, dir), "utf8"), name).not.toThrow();
    }
    expect(new Set(entries.values()).size).toBe(feedCardKinds.length);
  });
  it("les genres réservés à un autre lot rendent UnknownCard (fichiers réservés)", () => {
    for (const kind of feedCardKinds.filter(isFeedKindReserved)) {
      const file = readFileSync(new URL(`${entries.get(kind)}.tsx`, dir), "utf8");
      expect(file, kind).toContain("UnknownCard");
    }
  });
  it("une carte inconnue tombe sur UnknownCard", () => {
    expect(registry).toContain("UnknownCard");
    expect(registry).toMatch(/known \? cardRegistry/);
  });
});
