import { describe, expect, it } from "vitest";

import { normalizePlate } from "./misc";
import { formatPlate, plateKind } from "./plateNumber";

describe("numéro de plaque (lot M2)", () => {
  it("une seule forme stockée, quelle que soit la saisie", () => {
    for (const raw of ["AE-665GH", "ae 665 gh", " Ae-665-Gh ", "AE.665.GH", "aé 665 gh"]) {
      expect(normalizePlate(raw), raw).toBe("AE665GH");
    }
  });

  it("reconnaît chaque format français", () => {
    const cases: [string, ReturnType<typeof plateKind>, string][] = [
      ["ae665gh", "siv", "AE-665-GH"],
      ["FT 340 NC", "siv", "FT-340-NC"],
      ["W-623-AX", "wGarage", "W-623-AX"],
      ["w623ax", "wGarage", "W-623-AX"],
      ["WW-123-AB", "ww", "WW-123-AB"],
      ["1234 AB 66", "fni", "1234 AB 66"],
      ["7abc34", "fni", "7 ABC 34"],
      ["456 BCD 2A", "fni", "456 BCD 2A"],
      ["12 AB 974", "fni", "12 AB 974"],
      ["1234 WW 66", "fni", "1234 WW 66"],
      ["6 CMD 5", "diplomatic", "6 CMD 5"],
      ["123 K 4567", "diplomatic", "123 K 4567"],
    ];
    for (const [raw, kind, shown] of cases) {
      expect(plateKind(raw), raw).toBe(kind);
      expect(formatPlate(raw), raw).toBe(shown);
    }
  });

  it("une plaque étrangère ou exotique n'a pas de format, et reste lisible telle que saisie", () => {
    for (const raw of ["B-AB 1234", "GE 123456", "AB-000-CD", "IO-123-UA", "0 AB 66", "TOYOTA"]) {
      expect(plateKind(raw), raw).toBeNull();
    }
    expect(formatPlate("b-ab  1234")).toBe("B-AB 1234");
    expect(formatPlate("")).toBe("");
  });

  it("le SIV refuse « SS » et « WW » à gauche (le WW est le provisoire)", () => {
    expect(plateKind("SS-123-AB")).toBeNull();
    expect(plateKind("WW-123-AB")).toBe("ww");
  });
});
