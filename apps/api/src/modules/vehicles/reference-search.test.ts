// Lot R3c : recherche « Marque ou modèle » sur le référentiel complet, tolérante et mesurée.
import type { VehicleReferenceHit } from "@orasso/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetDb } from "../../../test/helpers";
import { app } from "../../app";
import { pool } from "../../db/client";
import { vehicleCatalog } from "../../db/seed/vehicle-catalog";
import { referenceSearch, SEARCH_ALIASES } from "./reference-search";
import { syncVehicleReference } from "./reference-sync";

afterAll(async () => {
  referenceSearch.invalidate();
  await pool.end();
});

beforeAll(async () => {
  await resetDb();
  await syncVehicleReference();
  referenceSearch.invalidate();
});

const search = async (q: string, type?: string) => {
  const params = new URLSearchParams({ q, ...(type ? { type } : {}) });
  const res = await app.request(`/api/vehicle-reference/search?${params}`);
  expect(res.status).toBe(200);
  return (await res.json()) as VehicleReferenceHit[];
};
const label = (h: VehicleReferenceHit | undefined) =>
  h ? [h.makeName, h.modelName, h.generationName].filter(Boolean).join(" ") : "";

describe("recherche « Marque ou modèle » (lot R3c)", () => {
  it("« 207 » et « peugeot 207 » trouvent la Peugeot 207 en premier", async () => {
    for (const q of ["207", "peugeot 207", "Peugeot 207", "PEUGEOT207"]) {
      const [first] = await search(q);
      expect(first, q).toMatchObject({ kind: "model", makeName: "Peugeot", modelName: "207", vehicleType: "car" });
    }
  });

  it("« golf 4 », « golf iv », « golf4 » trouvent la Golf Mk4", async () => {
    for (const q of ["golf 4", "golf iv", "Golf IV", "golf4", "volkswagen golf mk4"]) {
      const [first] = await search(q);
      expect(label(first), q).toBe("Volkswagen Golf Mk4");
      expect(first).toMatchObject({ kind: "generation", yearFrom: 1997, yearTo: 2003 });
    }
  });

  it("« e36 » trouve les BMW E36 (Série 3, M3)", async () => {
    const hits = (await search("e36")).map(label);
    expect(hits).toEqual(expect.arrayContaining(["BMW Série 3 E36", "BMW M3 E36"]));
    expect(hits.every((h) => h.startsWith("BMW"))).toBe(true);
  });

  it("« mx5 », « MX-5 », « mx 5 » trouvent la Mazda MX-5 ; « mx5 nb » sa génération NB", async () => {
    for (const q of ["mx5", "MX-5", "mx 5", "Mazda MX5"]) {
      const [first] = await search(q);
      expect(label(first), q).toBe("Mazda MX-5");
    }
    expect(label((await search("mx5 nb"))[0])).toBe("Mazda MX-5 NB");
  });

  it("sans accents ni casse : « megane », « scenic », « citroen c3 »", async () => {
    expect((await search("megane")).map(label)).toContain("Renault Megane");
    expect(label((await search("scenic"))[0])).toBe("Renault Scénic");
    expect(label((await search("citroen c3"))[0])).toBe("Citroën C3");
  });

  it("une marque seule rend la marque ; le type filtre ; rien d'inconnu ni de « Autre »", async () => {
    expect((await search("peugeot"))[0]).toMatchObject({ kind: "make", makeName: "Peugeot", modelId: null });
    const motos = await search("honda", "moto");
    expect(motos[0]?.kind).toBe("make");
    expect((await search("africa twin", "moto"))[0]).toMatchObject({ modelName: "Africa Twin", vehicleType: "moto" });
    expect(await search("africa twin", "car")).toEqual([]);
    expect(await search("zzz introuvable")).toEqual([]);
    expect((await search("autre")).some((h) => h.makeName === "Autre" || h.modelName === "Autre")).toBe(false);
  });

  it("noms de passion : « 350z », « miata », « trueno », « pagode »", async () => {
    expect(label((await search("350z"))[0])).toBe("Nissan Z Z33");
    expect(label((await search("miata"))[0])).toBe("Mazda MX-5");
    expect(label((await search("trueno"))[0])).toBe("Toyota Corolla AE86");
    expect(label((await search("pagode"))[0])).toBe("Mercedes-Benz SL W113");
    // Chaque nom de passion pointe vers une ligne qui existe.
    for (const key of Object.keys(SEARCH_ALIASES)) {
      const [make, model, gen] = key.split("|");
      const m = vehicleCatalog.find((x) => x.name === make)?.models.find((x) => x.name === model);
      expect(m, key).toBeDefined();
      if (gen)
        expect(
          m?.generations.map((g) => g.name),
          key,
        ).toContain(gen);
    }
  });

  it("la saisie est contrôlée (vide ou trop longue refusée)", async () => {
    expect((await app.request("/api/vehicle-reference/search?q=")).status).toBe(400);
    expect((await app.request(`/api/vehicle-reference/search?q=${"a".repeat(61)}`)).status).toBe(400);
  });

  it("reste rapide sur le référentiel complet (temps mesuré)", async () => {
    referenceSearch.invalidate();
    const coldStart = performance.now();
    await referenceSearch.search({ q: "207", limit: 20 });
    const cold = performance.now() - coldStart;
    const queries = ["207", "peugeot 207", "golf 4", "e36", "mx5", "a", "ser", "classe c w204", "yamaha r1", "zzz"];
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      for (const q of queries) {
        const start = performance.now();
        await referenceSearch.search({ q, limit: 20 });
        times.push(performance.now() - start);
      }
    }
    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)] ?? 0;
    const p95 = times[Math.floor(times.length * 0.95)] ?? 0;
    console.log(
      `Recherche du référentiel : index ${cold.toFixed(0)} ms (premier appel), ` +
        `médiane ${median.toFixed(2)} ms, 95e centile ${p95.toFixed(2)} ms sur ${times.length} recherches`,
    );
    // Seuils larges (PC partagé, tests en parallèle) : l'ordre de grandeur attendu est la milliseconde.
    expect(median).toBeLessThan(25);
    expect(p95).toBeLessThan(60);
    expect(cold).toBeLessThan(5000);
  });
});
