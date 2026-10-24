import { describe, expect, it } from "vitest";
import { defaultChoice, type ExplorerChoice, readChoice, storeChoice } from "./explorerChoice";

const chosen: ExplorerChoice = {
  segment: "pros",
  sort: "seats",
  around: { kind: "dept", code: "11" },
  radius: null,
  filters: { format: "exhibition", when: "weekend", affinity: true, followed: true },
  prefFormatsOn: false,
  pros: { activity: "garage", department: "66", radiusKm: 25 },
};

describe("le choix de l'Explorer reste (lot R1)", () => {
  it("se garde et se relit tel quel (aller-retour par JSON, comme le trousseau)", () => {
    const back = readChoice(JSON.parse(JSON.stringify(storeChoice(chosen))));
    expect(back).toEqual(chosen);
    // La distance des préférences (`undefined`) passe par « prefs ».
    const prefs = { ...chosen, radius: undefined };
    expect(storeChoice(prefs).radius).toBe("prefs");
    expect(readChoice(JSON.parse(JSON.stringify(storeChoice(prefs))))?.radius).toBeUndefined();
    expect(readChoice(JSON.parse(JSON.stringify(storeChoice({ ...chosen, radius: 50 }))))?.radius).toBe(50);
  });

  it("« Autour de moi » ne garde que le mode, jamais de coordonnées", () => {
    const stored = storeChoice({ ...chosen, around: { kind: "me" } });
    expect(stored.around).toEqual({ kind: "me" });
    expect(JSON.stringify(stored)).not.toMatch(/lat|lng|position|coords/i);
    // Une valeur enregistrée qui en porterait (version modifiée) les perd à la lecture.
    expect(readChoice({ around: { kind: "me", lat: 42.7, lng: 2.9 } })?.around).toEqual({ kind: "me" });
  });

  it("rien de gardé : `null` ; valeur illisible : chaque champ reprend sa valeur par défaut", () => {
    expect(readChoice(null)).toBeNull();
    expect(readChoice("x")).toBeNull();
    expect(readChoice([])).toBeNull();
    expect(
      readChoice({
        segment: "personnes",
        sort: "prix",
        around: { kind: "dept", code: "999" },
        radius: 33,
        filters: { format: "drift", when: "demain", affinity: "oui", followed: 1 },
        prefFormatsOn: "non",
        pros: { activity: "boulangerie", department: "XX", radiusKm: 7 },
      }),
    ).toEqual({ ...defaultChoice, prefFormatsOn: true });
  });
});
