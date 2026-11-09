// Lot R7j : la règle du jour d'un souvenir (« il y a un an »). Fuseau de Paris, 29 février, tampon posé tard la veille.
import { describe, expect, it } from "vitest";

import { memoryAgo, memoryLabels } from "../labels/memories.fr";
import {
  MEMORY_NOTIFY_HOUR,
  memoryCanCreate,
  memoryDayKeys,
  memoryDayStamp,
  memoryDayStart,
  memoryDeliverAt,
  memoryYearsAgo,
  memoryYearsSince,
} from "./memories";

const d = (iso: string) => new Date(iso);

describe("memoryYearsAgo : le jour d'anniversaire", () => {
  it("même jour et même mois, il y a 1, 2, 3 ans", () => {
    const stamp = d("2025-11-09T10:00:00Z");
    expect(memoryYearsAgo(stamp, d("2026-11-09T08:00:00Z"))).toBe(1);
    expect(memoryYearsAgo(stamp, d("2027-11-09T08:00:00Z"))).toBe(2);
    expect(memoryYearsAgo(stamp, d("2028-11-09T08:00:00Z"))).toBe(3);
  });

  it("pas le bon jour, pas le bon mois, ou moins d'un an : rien", () => {
    const stamp = d("2025-11-09T10:00:00Z");
    expect(memoryYearsAgo(stamp, d("2026-11-08T10:00:00Z"))).toBeNull();
    expect(memoryYearsAgo(stamp, d("2026-11-10T10:00:00Z"))).toBeNull();
    expect(memoryYearsAgo(stamp, d("2026-12-09T10:00:00Z"))).toBeNull();
    // Le jour même de la pose : pas encore un souvenir.
    expect(memoryYearsAgo(stamp, d("2025-11-09T20:00:00Z"))).toBeNull();
  });

  it("un tampon posé la veille à 23 h 50 (Paris) compte pour son jour local, pas pour celui d'UTC", () => {
    // 23 h 50 à Paris le 8 novembre (UTC+1) = 22 h 50 UTC le 8 : jour local = le 8.
    const lateEve = d("2025-11-08T22:50:00Z");
    expect(memoryYearsAgo(lateEve, d("2026-11-08T12:00:00Z"))).toBe(1);
    expect(memoryYearsAgo(lateEve, d("2026-11-09T12:00:00Z"))).toBeNull();
    // 00 h 30 à Paris le 9 novembre = 23 h 30 UTC le 8 : jour local = le 9, pas le 8.
    const justAfterMidnight = d("2025-11-08T23:30:00Z");
    expect(memoryYearsAgo(justAfterMidnight, d("2026-11-09T12:00:00Z"))).toBe(1);
    expect(memoryYearsAgo(justAfterMidnight, d("2026-11-08T12:00:00Z"))).toBeNull();
  });

  it("l'instant d'aujourd'hui se lit aussi à l'heure de Paris (le soir, juste avant minuit)", () => {
    const stamp = d("2025-07-15T10:00:00Z");
    // 23 h 30 à Paris le 14 juillet (UTC+2) = 21 h 30 UTC : encore le 14, pas le 15.
    expect(memoryYearsAgo(stamp, d("2026-07-14T21:30:00Z"))).toBeNull();
    // 00 h 30 à Paris le 15 = 22 h 30 UTC le 14 : c'est le 15.
    expect(memoryYearsAgo(stamp, d("2026-07-14T22:30:00Z"))).toBe(1);
  });

  it("le 29 février revient le 28 février des années non bissextiles, le 29 des bissextiles", () => {
    const leap = d("2024-02-29T10:00:00Z");
    expect(memoryYearsAgo(leap, d("2025-02-28T10:00:00Z"))).toBe(1);
    expect(memoryYearsAgo(leap, d("2025-03-01T10:00:00Z"))).toBeNull();
    expect(memoryYearsAgo(leap, d("2026-02-28T10:00:00Z"))).toBe(2);
    expect(memoryYearsAgo(leap, d("2028-02-29T10:00:00Z"))).toBe(4);
    // Une année bissextile : le 28 février n'est pas l'anniversaire d'un 29 février.
    expect(memoryYearsAgo(leap, d("2028-02-28T10:00:00Z"))).toBeNull();
  });

  it("un tampon du 28 février n'est pas l'anniversaire du 28 février quand 'aujourd'hui' est un 29", () => {
    const stamp = d("2023-02-28T10:00:00Z");
    expect(memoryYearsAgo(stamp, d("2024-02-29T10:00:00Z"))).toBeNull();
    expect(memoryYearsAgo(stamp, d("2024-02-28T10:00:00Z"))).toBe(1);
  });
});

describe("memoryYearsSince : les années pleines, quel que soit le jour", () => {
  it("avant l'anniversaire de l'année, après, et le jour même", () => {
    const stamp = d("2025-11-09T10:00:00Z");
    expect(memoryYearsSince(stamp, d("2026-11-08T10:00:00Z"))).toBe(0);
    expect(memoryYearsSince(stamp, d("2026-11-09T10:00:00Z"))).toBe(1);
    expect(memoryYearsSince(stamp, d("2026-11-10T10:00:00Z"))).toBe(1);
    expect(memoryYearsSince(stamp, d("2027-11-08T10:00:00Z"))).toBe(1);
    expect(memoryYearsSince(stamp, d("2027-11-09T10:00:00Z"))).toBe(2);
  });

  it("jamais négatif ; le 29 février compte au 28 en année non bissextile", () => {
    expect(memoryYearsSince(d("2026-11-09T10:00:00Z"), d("2025-01-01T10:00:00Z"))).toBe(0);
    expect(memoryYearsSince(d("2024-02-29T10:00:00Z"), d("2025-02-28T10:00:00Z"))).toBe(1);
    expect(memoryYearsSince(d("2024-02-29T10:00:00Z"), d("2025-02-27T10:00:00Z"))).toBe(0);
  });
});

describe("clés du jour, notification et carte", () => {
  it("les clés MM-JJ à chercher : aujourd'hui, et le 29 février le 28 d'une année non bissextile", () => {
    expect(memoryDayKeys(d("2026-11-09T08:00:00Z"))).toEqual(["11-09"]);
    expect(memoryDayKeys(d("2025-02-28T12:00:00Z"))).toEqual(["02-28", "02-29"]);
    expect(memoryDayKeys(d("2028-02-28T12:00:00Z"))).toEqual(["02-28"]);
    expect(memoryDayKeys(d("2028-02-29T12:00:00Z"))).toEqual(["02-29"]);
  });

  it("le jour local sert de clé de dédoublonnage", () => {
    expect(memoryDayStamp(d("2026-11-09T08:00:00Z"))).toBe("2026-11-09");
    // 23 h 30 UTC le 9 novembre = 00 h 30 à Paris le 10.
    expect(memoryDayStamp(d("2026-11-09T23:30:00Z"))).toBe("2026-11-10");
  });

  it("la notification part à 10 h, heure de Paris (hiver et été)", () => {
    expect(MEMORY_NOTIFY_HOUR).toBe(10);
    expect(memoryDeliverAt(d("2026-11-09T08:00:00Z")).toISOString()).toBe("2026-11-09T09:00:00.000Z");
    expect(memoryDeliverAt(d("2026-07-14T07:00:00Z")).toISOString()).toBe("2026-07-14T08:00:00.000Z");
  });

  it("la carte du Fil est datée du début du jour local", () => {
    expect(memoryDayStart(d("2026-11-09T14:00:00Z")).toISOString()).toBe("2026-11-08T23:00:00.000Z");
    expect(memoryDayStart(d("2026-07-14T14:00:00Z")).toISOString()).toBe("2026-07-13T22:00:00.000Z");
  });
});

describe("libellés", () => {
  it("« un an » au singulier, « 2 ans » ensuite", () => {
    expect(memoryAgo(1)).toBe("Il y a un an");
    expect(memoryAgo(3)).toBe("Il y a 3 ans");
    expect(memoryLabels.eyebrow(1)).toBe("Il y a un an, jour pour jour");
    expect(memoryLabels.headline("Béziers Night")).toBe("Tu étais là : Béziers Night");
    expect(memoryLabels.notificationBody(2, "Béziers Night")).toBe("Il y a 2 ans, tu étais là : Béziers Night.");
  });
});

describe("création tardive et formules", () => {
  it("pas de souvenir créé à 22 h locales ou après (la livraison passerait au lendemain)", () => {
    expect(memoryCanCreate(d("2026-11-09T07:00:00Z"))).toBe(true); // 8 h
    expect(memoryCanCreate(d("2026-11-09T20:59:00Z"))).toBe(true); // 21 h 59
    expect(memoryCanCreate(d("2026-11-09T21:00:00Z"))).toBe(false); // 22 h
    expect(memoryCanCreate(d("2026-07-09T19:59:00Z"))).toBe(true); // 21 h 59 en été
    expect(memoryCanCreate(d("2026-07-09T20:00:00Z"))).toBe(false); // 22 h en été
  });

  it("formule datée, formule neutre et ligne du plateau", () => {
    expect(memoryLabels.eyebrowOn(1, "8 novembre 2025")).toBe("Il y a un an, le 8 novembre 2025");
    expect(memoryLabels.plateauLine("Toyota GR Supra", 37, 118)).toBe(
      "Ta Toyota GR Supra, n° 37 du plateau, au milieu de 118 voitures.",
    );
    expect(memoryLabels.plateauLine("Mazda MX-5", 1, 1)).toBe("Ta Mazda MX-5, n° 1 du plateau.");
  });
});
