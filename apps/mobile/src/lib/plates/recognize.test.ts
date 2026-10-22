// Accueil drive (lot 48) : extraction des plaques du texte lu par ML Kit — 20 chaînes, dont 6 pièges.
import { describe, expect, it } from "vitest";

import { extractPlates } from "./recognize";

describe("extractPlates", () => {
  const cases: [string, string, string | null][] = [
    // Lectures propres.
    ["SIV avec tirets", "GA-662-KS", "GA662KS"],
    ["SIV avec espaces", "GA 662 KS", "GA662KS"],
    ["SIV collée", "GA662KS", "GA662KS"],
    ["SIV en minuscules", "ga-662-ks", "GA662KS"],
    ["bande européenne et département autour", "F\nGA-662-KS 66", "GA662KS"],
    ["FNI à 4 chiffres", "1234 AB 66", "1234AB66"],
    ["FNI à 1 chiffre et 3 lettres", "7 ABC 34", "7ABC34"],
    ["FNI corse", "456 BCD 2A", "456BCD2A"],
    ["FNI outre-mer (3 chiffres)", "12 AB 974", "12AB974"],
    ["plaque au milieu d'une ligne de texte", "Toyota GR Supra BX-120-QT Kenji", "BX120QT"],
    // Confusions tolérées.
    ["O lu à la place de 0", "GA-6O2-KS", "GA602KS"],
    ["I lu à la place de 1", "GA-I62-KS", "GA162KS"],
    ["8 lu à la place de B", "8X-120-QT", "BX120QT"],
    ["B lu à la place de 8 (FNI)", "12B4 AB 66", "1284AB66"],
  ];

  it.each(cases)("%s", (_name, text, expected) => {
    expect(extractPlates(text)[0]).toBe(expected);
  });

  // Pièges : rien ne doit sortir.
  const traps: [string, string][] = [
    ["numéro de téléphone", "06 12 34 56 78"],
    ["date", "12/10/2026 08:12"],
    ["texte sans chiffre", "TOYOTA GR SUPRA"],
    ["plaque incomplète", "GA-662"],
    ["que des O et des 0", "OO-000-OO"],
    ["adresse web", "WWW.ORASSO.FR"],
  ];

  it.each(traps)("piège : %s", (_name, text) => {
    expect(extractPlates(text)).toEqual([]);
  });

  it("20 chaînes dont 6 pièges", () => {
    expect(cases.length + traps.length).toBe(20);
  });

  it("variantes : un découpage ambigu donne plusieurs candidates, SIV d'abord", () => {
    const plates = extractPlates("AB-123-CD 66");
    expect(plates[0]).toBe("AB123CD");
    expect(plates).toContain("123CD66");
  });

  it("SIV interdite (I, O, U) : pas retenue comme SIV", () => {
    expect(extractPlates("IO-123-UA")).not.toContain("IO123UA");
  });
});

describe("formats ajoutés au lot M2 (lecture stricte de l'accueil drive)", () => {
  it.each([
    ["W garage", "W-623-AX", "W623AX"],
    ["WW provisoire", "WW-123-AB", "WW123AB"],
    ["diplomatique CD", "12 CD 3456", "12CD3456"],
    ["diplomatique CMD", "6 CMD 15", "6CMD15"],
  ])("%s", (_name, text, expected) => {
    expect(extractPlates(text)[0]).toBe(expected);
  });

  it("le WW n'est pas une SIV, mais reste lu comme un provisoire", () => {
    expect(extractPlates("WW-123-AB")).toEqual(["WW123AB"]);
  });
});
