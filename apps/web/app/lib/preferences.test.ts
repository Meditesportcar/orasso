import { describe, expect, it } from "vitest";

import { parsePreferencesForm } from "./preferences";

const form = (entries: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};

describe("formulaire « Tes préférences »", () => {
  it("types, distance, départements et interrupteurs deviennent le corps du PATCH", () => {
    const res = parsePreferencesForm(
      form([
        ["eventFormat", "night"],
        ["eventFormat", "gathering"],
        ["radiusKm", "60"],
        ["departments", "66, 11 ; 2a"],
        ["notify_newEvents", "on"],
        ["notify_followedNews", "on"],
      ]),
    );
    expect(res).toEqual({
      ok: true,
      update: {
        eventFormats: ["gathering", "night"],
        radiusKm: 60,
        departments: ["66", "11", "2A"],
        notifications: { newEvents: true, freedSpots: false, followedNews: true },
      },
    });
  });

  it("aucune case cochée : tous les types (liste vide), tous les interrupteurs coupés", () => {
    const res = parsePreferencesForm(form([["radiusKm", "50"]]));
    expect(res).toMatchObject({
      ok: true,
      update: { eventFormats: [], departments: [], notifications: { newEvents: false, freedSpots: false } },
    });
  });

  it("la distance reste dans le curseur (10 à 200 km, pas de 10)", () => {
    const radius = (v: string) => {
      const res = parsePreferencesForm(form([["radiusKm", v]]));
      return res.ok ? res.update.radiusKm : null;
    };
    expect(radius("5")).toBe(10);
    expect(radius("300")).toBe(200);
    expect(radius("")).toBe(10);
    expect(radius("abc")).toBe(50);
  });

  it("refuse un département inconnu et plus de 20 départements, en français", () => {
    expect(parsePreferencesForm(form([["departments", "66, 99X"]]))).toEqual({
      ok: false,
      error: "Département inconnu : 99X",
    });
    const many = [...Array.from({ length: 19 }, (_, i) => String(i + 1).padStart(2, "0")), "21", "22"].join(",");
    expect(parsePreferencesForm(form([["departments", many]]))).toEqual({
      ok: false,
      error: "Tu peux choisir 20 départements au plus.",
    });
  });

  it("la distance du compte (jusqu'à 300 km) n'est renvoyée que si le curseur a bougé", () => {
    const update = (radiusKm: string, radiusInitial: string) => {
      const res = parsePreferencesForm(
        form([
          ["radiusKm", radiusKm],
          ["radiusInitial", radiusInitial],
        ]),
      );
      return res.ok ? res.update : null;
    };
    // Compte à 300 km, curseur resté en butée à 200 : rien n'est envoyé.
    expect(update("200", "300")).not.toHaveProperty("radiusKm");
    expect(update("60", "60")).not.toHaveProperty("radiusKm");
    // Curseur bougé : la nouvelle valeur part.
    expect(update("120", "300")).toMatchObject({ radiusKm: 120 });
    expect(update("70", "60")).toMatchObject({ radiusKm: 70 });
  });

  it("sans JavaScript, les cases `departmentBox` font foi, y compris tout décocher", () => {
    const base: [string, string][] = [
      ["departmentBoxes", "1"],
      ["departments", "66, 11"],
    ];
    const some = parsePreferencesForm(form([...base, ["departmentBox", "34"], ["departmentBox", "11"]]));
    expect(some).toMatchObject({ ok: true, update: { departments: ["34", "11"] } });
    const none = parsePreferencesForm(form(base));
    expect(none).toMatchObject({ ok: true, update: { departments: [] } });
  });

  it("avec JavaScript, le champ texte fait foi (la liste pose `departmentBoxOrder`)", () => {
    const res = parsePreferencesForm(
      form([
        ["departmentBoxes", "1"],
        ["departmentBoxOrder", "11,66"],
        ["departmentBox", "11"],
        ["departmentBox", "66"],
        ["departments", "11, 66"],
      ]),
    );
    expect(res).toMatchObject({ ok: true, update: { departments: ["11", "66"] } });
  });
});
