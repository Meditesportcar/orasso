import { describe, expect, it } from "vitest";

import { departmentFromPostalCode } from "../enums";
import { describeRecurrence, duplicateDates, nthWeekdayOfMonth, recurrenceOccurrences } from "./recurrence";
import { canSubmitVerification, isValidRna, isValidSiren, isValidSiret, parseRegistryNumber } from "./registry";
import { fromWallTime, wallTime } from "./time";

const paris = (year: number, month: number, day: number, hour: number, minute = 0) =>
  fromWallTime({ year, month, day, hour, minute });

describe("récurrence", () => {
  it("n-ième jour de la semaine d'un mois", () => {
    // Juillet 2026 : le 1er est un mercredi.
    expect(nthWeekdayOfMonth(2026, 7, 1, 0)).toBe(5); // premier dimanche
    expect(nthWeekdayOfMonth(2026, 7, 2, 6)).toBe(11); // deuxième samedi
    expect(nthWeekdayOfMonth(2026, 7, -1, 0)).toBe(26); // dernier dimanche
    expect(nthWeekdayOfMonth(2026, 2, 5, 1)).toBeNull(); // pas de 5e lundi en février 2026
  });

  it("chaque premier dimanche du mois, heure murale conservée malgré le changement d'heure", () => {
    const start = paris(2026, 9, 6, 9); // premier dimanche de septembre
    const end = paris(2026, 9, 6, 13);
    const out = recurrenceOccurrences(start, end, { kind: "monthly_nth_weekday", nth: 1, weekday: 0, count: 3 });
    expect(out.map((o) => o.startsAt)).toEqual([paris(2026, 10, 4, 9), paris(2026, 11, 1, 9), paris(2026, 12, 6, 9)]);
    expect(out.map((o) => wallTime(o.startsAt).hour)).toEqual([9, 9, 9]);
    expect(out.map((o) => o.endsAt.getTime() - o.startsAt.getTime())).toEqual([
      4 * 3_600_000,
      4 * 3_600_000,
      4 * 3_600_000,
    ]);
  });

  it("l'origine n'est jamais répétée : si elle n'est pas le n-ième jour, la série commence le mois suivant", () => {
    const start = paris(2026, 7, 11, 18); // un samedi, pas le premier dimanche
    const out = recurrenceOccurrences(start, paris(2026, 7, 11, 22), {
      kind: "monthly_nth_weekday",
      nth: 1,
      weekday: 0,
      count: 2,
    });
    expect(out.map((o) => wallTime(o.startsAt).day)).toEqual([2, 6]); // dimanche 2 août, 6 septembre
    // Même mois, mais le n-ième jour est après l'origine : il est créé.
    const early = recurrenceOccurrences(paris(2026, 7, 1, 18), paris(2026, 7, 1, 22), {
      kind: "monthly_nth_weekday",
      nth: 1,
      weekday: 0,
      count: 1,
    });
    expect(wallTime(early[0]!.startsAt)).toMatchObject({ month: 7, day: 5 });
  });

  it("toutes les 2 semaines, et au plus 12 occurrences", () => {
    const out = recurrenceOccurrences(paris(2026, 6, 6, 18), paris(2026, 6, 6, 23), {
      kind: "weekly",
      interval: 2,
      count: 30,
    });
    expect(out).toHaveLength(12);
    expect(out[0]?.startsAt).toEqual(paris(2026, 6, 20, 18));
    expect(out[1]?.startsAt).toEqual(paris(2026, 7, 4, 18));
  });

  it("événement sur deux jours : la durée suit", () => {
    const out = recurrenceOccurrences(paris(2026, 6, 6, 9), paris(2026, 6, 7, 18), {
      kind: "weekly",
      interval: 4,
      count: 1,
    });
    expect(out[0]).toEqual({ startsAt: paris(2026, 7, 4, 9), endsAt: paris(2026, 7, 5, 18) });
  });

  it("libellé lisible", () => {
    expect(describeRecurrence({ kind: "monthly_nth_weekday", nth: 1, weekday: 0, count: 5 })).toBe(
      "Chaque premier dimanche du mois, 5 fois après l'événement d'origine",
    );
    expect(describeRecurrence({ kind: "weekly", interval: 2, count: 3 })).toContain("Toutes les 2 semaines");
  });
});

describe("duplication", () => {
  it("52 semaines plus tard, même jour de la semaine et même heure", () => {
    const d = duplicateDates(paris(2026, 6, 6, 19), paris(2026, 6, 6, 23), paris(2026, 6, 20, 10));
    expect(d.startsAt).toEqual(paris(2027, 6, 5, 19));
    expect(wallTime(d.startsAt).hour).toBe(19);
    expect(d.shiftDays).toBe(364);
  });

  it("un événement encore à venir est décalé jusqu'à être dans le futur", () => {
    const d = duplicateDates(paris(2026, 6, 6, 19), paris(2026, 6, 6, 23), paris(2027, 6, 5, 12));
    expect(d.startsAt.getTime()).toBeGreaterThan(paris(2027, 6, 6, 12).getTime());
    expect(d.shiftDays % 364).toBe(0);
  });
});

describe("numéros SIRET, SIREN et RNA", () => {
  it("clé de Luhn", () => {
    expect(isValidSiren("356000000")).toBe(true);
    expect(isValidSiren("356000001")).toBe(false);
    expect(isValidSiret("35600000000048")).toBe(true);
    expect(isValidSiret("35600000000049")).toBe(false);
    expect(isValidSiret("1234567890123")).toBe(false);
  });

  it("établissements de La Poste : somme des chiffres multiple de 5", () => {
    expect(isValidSiret("35600000012345")).toBe(false); // 3+5+6+1+2+3+4+5 = 29
    expect(isValidSiret("35600000012346")).toBe(true); // 30
  });

  it("RNA", () => {
    expect(isValidRna("W661000001")).toBe(true);
    expect(isValidRna("w661000001")).toBe(false);
    expect(isValidRna("W66100000")).toBe(false);
  });

  it("saisie : espaces et minuscules acceptés, erreur claire sinon", () => {
    expect(parseRegistryNumber(" 356 000 000 00048 ")).toEqual({ source: "siret", value: "35600000000048" });
    expect(parseRegistryNumber("w661000001")).toEqual({ source: "rna", value: "W661000001" });
    expect(parseRegistryNumber("35600000000049")).toHaveProperty("error");
    expect(parseRegistryNumber("abc")).toHaveProperty("error");
  });
});

describe("envoi de la vérification", () => {
  const matched = { status: "matched" } as never;
  it("au moins un justificatif, puis registre concluant ou pièce d'identité", () => {
    expect(canSubmitVerification(null, []).ok).toBe(false);
    expect(canSubmitVerification(matched, []).ok).toBe(false);
    expect(canSubmitVerification(matched, ["statutes"]).ok).toBe(true);
    expect(canSubmitVerification(null, ["statutes"]).ok).toBe(false);
    expect(canSubmitVerification({ status: "not_found" } as never, ["statutes"]).ok).toBe(false);
    expect(canSubmitVerification(null, ["identity"]).ok).toBe(true);
  });
});

describe("département d'un code postal", () => {
  it("métropole, Corse, outre-mer, invalide", () => {
    expect(departmentFromPostalCode("66140")).toBe("66");
    expect(departmentFromPostalCode("75001")).toBe("75");
    expect(departmentFromPostalCode("20000")).toBe("2A");
    expect(departmentFromPostalCode("20200")).toBe("2B");
    expect(departmentFromPostalCode("97400")).toBe("974");
    expect(departmentFromPostalCode("123")).toBeNull();
    expect(departmentFromPostalCode(null)).toBeNull();
    expect(departmentFromPostalCode("00000")).toBeNull();
  });
});
