import { describe, expect, it } from "vitest";

import { parsePreferencesForm } from "./preferences";

const form = (entries: [string, string][]) => {
  const f = new FormData();
  for (const [k, v] of entries) f.append(k, v);
  return f;
};

describe("formulaire « Tes préférences »", () => {
  it("coin, distance, types, centres d'intérêt et interrupteur deviennent le corps du PATCH", () => {
    const res = parsePreferencesForm(
      form([
        ["eventFormat", "night"],
        ["eventFormat", "gathering"],
        ["radiusKm", "60"],
        ["departments", "66, 11 ; 2a"],
        ["interest", "cat-1"],
        ["interest", "cat-2"],
        ["notify_newEvents", "on"],
      ]),
    );
    expect(res).toEqual({
      ok: true,
      update: {
        eventFormats: ["gathering", "night"],
        radiusKm: 60,
        departments: ["66", "11", "2A"],
        interests: ["cat-1", "cat-2"],
        newEvents: true,
      },
    });
  });

  it("aucune case cochée : tous les types et aucun centre d'intérêt (listes vides), interrupteur coupé", () => {
    const res = parsePreferencesForm(form([["radiusKm", "50"]]));
    expect(res).toMatchObject({
      ok: true,
      update: { eventFormats: [], departments: [], interests: [], newEvents: false },
    });
  });

  it("la distance reste dans le curseur (10 à 200 km, pas de 10)", () => {
    const radius = (v: string) => {
      const res = parsePreferencesForm(form([["radiusKm", v]]));
      return res.ok ? res.update.radiusKm : null;
    };
    expect(radius("5")).toBe(10);
    expect(radius("300")).toBe(200);
    expect(radius("")).toBe(50);
    expect(radius("abc")).toBe(50);
  });

  it("« Partout en France » envoie null, quelle que soit la position du curseur", () => {
    const res = parsePreferencesForm(
      form([
        ["everywhere", "on"],
        ["radiusKm", "80"],
      ]),
    );
    expect(res).toMatchObject({ ok: true, update: { radiusKm: null } });
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

  it("la distance du compte n'est renvoyée que si elle a changé (curseur ou « Partout en France »)", () => {
    const update = (fields: [string, string][], radiusInitial: string) => {
      const res = parsePreferencesForm(form([...fields, ["radiusInitial", radiusInitial]]));
      return res.ok ? res.update : null;
    };
    expect(update([["radiusKm", "60"]], "60")).not.toHaveProperty("radiusKm");
    // Compte « Partout en France », case restée cochée : rien n'est envoyé.
    expect(
      update(
        [
          ["everywhere", "on"],
          ["radiusKm", "50"],
        ],
        "everywhere",
      ),
    ).not.toHaveProperty("radiusKm");
    // Curseur bougé : la nouvelle valeur part ; case décochée sur un compte « Partout » : le curseur part.
    expect(update([["radiusKm", "70"]], "60")).toMatchObject({ radiusKm: 70 });
    expect(update([["radiusKm", "50"]], "everywhere")).toMatchObject({ radiusKm: 50 });
    // Case cochée sur un compte à 60 km : null part.
    expect(
      update(
        [
          ["everywhere", "on"],
          ["radiusKm", "60"],
        ],
        "60",
      ),
    ).toMatchObject({ radiusKm: null });
  });

  it("« Partout » décoché avec un curseur absent ou vide : la valeur affichée est gardée, jamais 0 ni 10", () => {
    const update = (fields: [string, string][], radiusInitial?: string) => {
      const res = parsePreferencesForm(form(radiusInitial ? [...fields, ["radiusInitial", radiusInitial]] : fields));
      return res.ok ? res.update : null;
    };
    // Compte « Partout » : la valeur affichée par le curseur est celle de départ (50).
    expect(update([], "everywhere")).toMatchObject({ radiusKm: 50 });
    expect(update([["radiusKm", ""]], "everywhere")).toMatchObject({ radiusKm: 50 });
    // Compte à 120 km, curseur absent : la distance du compte, donc rien n'est réécrit.
    expect(update([], "120")).not.toHaveProperty("radiusKm");
    expect(update([["radiusKm", " "]], "120")).not.toHaveProperty("radiusKm");
    // Sans `radiusInitial` (appel direct) : la valeur de départ.
    expect(update([])).toMatchObject({ radiusKm: 50 });
    // Curseur réglé en même temps que la case décochée (sans JavaScript) : la valeur réglée part.
    expect(update([["radiusKm", "90"]], "everywhere")).toMatchObject({ radiusKm: 90 });
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
