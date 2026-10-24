// Lot R3c : le référentiel complet est cohérent et garde la liste de départ intacte (sans base de données).
import { describe, expect, it } from "vitest";
import { slugify } from "../../lib/slug";
import { mergeReference, parseReference, vehicleCatalog } from "./vehicle-catalog";
import { vehicleReference } from "./vehicle-reference";

const thisYear = new Date().getFullYear();
const count = (makes = vehicleCatalog) => ({
  makes: makes.length,
  models: makes.reduce((n, m) => n + m.models.length, 0),
  generations: makes.reduce((n, m) => n + m.models.reduce((k, x) => k + x.generations.length, 0), 0),
});

describe("référentiel des véhicules (lot R3c)", () => {
  it("aucun doublon : marque, modèle dans sa marque, génération dans son modèle (par slug)", () => {
    const dup = (names: string[]) => names.map(slugify).filter((s, i, all) => all.indexOf(s) !== i);
    expect(dup(vehicleCatalog.map((m) => m.name))).toEqual([]);
    for (const make of vehicleCatalog) {
      expect(dup(make.models.map((x) => x.name)), make.name).toEqual([]);
      for (const model of make.models) {
        expect(dup(model.generations.map((g) => g.name)), `${make.name} ${model.name}`).toEqual([]);
      }
    }
  });

  it("années cohérentes : début ≤ fin, rien après l'année en cours + 1 ; chaque modèle a une génération", () => {
    const wrong: string[] = [];
    for (const make of vehicleCatalog) {
      expect(make.country, make.name).toMatch(/^[A-Z]{2}$/);
      for (const model of make.models) {
        if (!model.generations.length) wrong.push(`${make.name} ${model.name} : aucune génération`);
        for (const g of model.generations) {
          const label = `${make.name} ${model.name} ${g.name}`;
          if (g.yearFrom < 1885 || g.yearFrom > thisYear + 1) wrong.push(`${label} : début ${g.yearFrom}`);
          if (g.yearTo !== null && (g.yearTo < g.yearFrom || g.yearTo > thisYear + 1)) {
            wrong.push(`${label} : fin ${g.yearTo}`);
          }
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it("la liste de départ est intacte : aucun nom renommé ni supprimé, mêmes années et même type", () => {
    for (const make of vehicleReference) {
      const target = vehicleCatalog.find((m) => m.name === make.name);
      expect(target, make.name).toBeDefined();
      for (const model of make.models) {
        const found = target?.models.find((x) => x.name === model.name);
        expect(found, `${make.name} ${model.name}`).toBeDefined();
        expect(found?.type).toBe(model.type);
        for (const g of model.generations) {
          expect(found?.generations).toContainEqual(g);
        }
      }
    }
  });

  it("couvre les marques et modèles courants (« Autre » doit rester rare)", () => {
    const has = (make: string, ...models: string[]) => {
      const m = vehicleCatalog.find((x) => x.name === make);
      expect(m, make).toBeDefined();
      for (const name of models)
        expect(
          m?.models.map((x) => x.name),
          `${make} ${name}`,
        ).toContain(name);
    };
    has("Peugeot", "107", "108", "207", "307", "308", "407", "508", "2008", "3008", "5008", "103", "Partner", "Boxer");
    has("Renault", "Laguna", "Scénic", "Captur", "Kangoo", "Trafic", "Master", "8");
    has("Citroën", "AX", "Xsara", "C3", "C4", "Berlingo", "Jumper", "Traction Avant");
    has("Volkswagen", "Passat", "Up!", "Tiguan", "Caddy", "Combi");
    has("BMW", "Série 7", "X5", "R 1250 GS");
    has("Mercedes-Benz", "Classe B", "Sprinter", "Vito");
    has("Yamaha", "Ténéré 700", "TMAX", "XT 500");
    has("Honda", "Jazz", "Africa Twin", "Gold Wing");
    has("Kawasaki", "Z650", "ZX-6R");
    has("KTM", "390 Duke", "1290 Super Duke R");
    has("Harley-Davidson", "Sportster", "Fat Boy");
    has("Royal Enfield", "Interceptor 650", "Himalayan");
    has("Toyota", "Yaris", "Hilux", "RAV4");
    has("Ford", "Transit", "Ranger", "Ka");
    for (const make of [
      "DS",
      "Dacia",
      "Cupra",
      "Lexus",
      "Tesla",
      "Ducati",
      "Triumph",
      "Aprilia",
      "MV Agusta",
      "Iveco",
    ]) {
      has(make);
    }
    const before = count(vehicleReference);
    const after = count();
    expect(after.makes).toBeGreaterThan(before.makes * 2);
    expect(after.models).toBeGreaterThan(before.models * 4);
    expect(after.generations).toBeGreaterThan(before.generations * 3);
  });

  it("les vrais tout-terrain restent marqués", () => {
    const offroad = (make: string, model: string) =>
      vehicleCatalog.find((m) => m.name === make)?.models.find((x) => x.name === model)?.offroad;
    expect(offroad("Land Rover", "Defender")).toBe(true);
    expect(offroad("Lada", "Niva")).toBe(true);
    expect(offroad("Toyota", "Supra")).toBeUndefined();
  });

  it("lecture du format : types, tout-terrain, génération sans nom ; une ligne illisible est refusée", () => {
    const [make] = parseReference(
      ["@ Test | FR | moto", "# commentaire", "A : I 1990-1995 ; II 1995-", "B [car, 4x4] : 2001-2003"].join("\n"),
    );
    expect(make).toEqual({
      name: "Test",
      country: "FR",
      models: [
        {
          name: "A",
          type: "moto",
          generations: [
            { name: "I", yearFrom: 1990, yearTo: 1995 },
            { name: "II", yearFrom: 1995, yearTo: null },
          ],
        },
        { name: "B", type: "car", offroad: true, generations: [{ name: "B", yearFrom: 2001, yearTo: 2003 }] },
      ],
    });
    expect(() => parseReference("A : 1990-1995")).toThrow(/ligne 1/);
    expect(() => parseReference("@ X | FR\nA : vers 1990")).toThrow(/ligne 2/);
    expect(() => parseReference("@ X | FR\nA [bus] : 1990-")).toThrow(/option inconnue/);
  });

  it("fusion : un modèle existant reçoit seulement les générations qui lui manquent", () => {
    const merged = mergeReference(
      [{ name: "Peugeot", country: "FR", models: [{ name: "205", type: "car", generations: [] }] }],
      parseReference("@ peugeot | FR\n205 : GTI 1984-1994 ; gti 1984-1994\n207 : 2006-2014"),
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.name).toBe("Peugeot");
    expect(merged[0]?.models.map((m) => [m.name, m.generations.length])).toEqual([
      ["205", 1],
      ["207", 1],
    ]);
  });
});
