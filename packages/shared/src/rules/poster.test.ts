import { describe, expect, it } from "vitest";

import { posterStyleLabels } from "../labels/arrival.fr";
import { posterPreviewSchema, posterSettingsSchema } from "../schemas/event";
import { fitTitle, posterDate, posterFormats, posterSize, posterStyles } from "./poster";
import { fromWallTime } from "./time";

describe("posterStyles", () => {
  it("huit modèles nommés, dans l'ordre du prototype", () => {
    expect(posterStyles).toEqual(["neon", "swiss", "retro", "jdm", "ticket", "mag", "minimal", "damier"]);
    expect(Object.keys(posterStyleLabels)).toHaveLength(8);
  });

  it("formats Post 4:5 et Story 9:16", () => {
    expect(posterFormats.post).toEqual([1080, 1350]);
    expect(posterFormats.story).toEqual([1080, 1920]);
    expect(posterSize("post", 540)).toEqual({ width: 540, height: 675 });
    expect(posterSize("story", 540)).toEqual({ width: 540, height: 960 });
  });
});

describe("fitTitle", () => {
  it("garde le corps maximal quand le titre tient sur une ligne", () => {
    const f = fitTitle("Rasso", 900, { maxSize: 100, charWidth: 0.9 });
    expect(f.lines).toEqual(["RASSO"]);
    expect(f.fontSize).toBe(100);
    expect(f.height).toBe(90);
  });

  it("passe sur deux lignes équilibrées, jamais au milieu d'un mot", () => {
    const f = fitTitle("Nocturne de Canet", 900, { maxSize: 120, charWidth: 0.9 });
    expect(f.lines).toEqual(["NOCTURNE", "DE CANET"]);
    expect(f.lines.join(" ")).toBe("NOCTURNE DE CANET");
  });

  it("ne tronque jamais : 34 caractères tiennent dans la largeur, le corps baisse", () => {
    const title = "Cars & Coffee Perpignan Rivesaltes";
    expect(title).toHaveLength(34);
    const f = fitTitle(title, 900, { maxSize: 120, charWidth: 0.9 });
    expect(f.lines.join(" ")).toBe(title.toUpperCase());
    for (const line of f.lines) expect(line.length * 0.9 * f.fontSize).toBeLessThanOrEqual(900);
    // Boîte du titre : lignes × corps × interligne.
    expect(f.height).toBe(Math.ceil(f.lines.length * f.fontSize * 0.9));
    expect(f.lines.length).toBeLessThanOrEqual(2);
  });

  it("un seul mot très long fait baisser le corps sans être coupé", () => {
    const f = fitTitle("Supercalifragilisticexpialidocious", 500, { maxSize: 120, charWidth: 0.9 });
    expect(f.lines).toHaveLength(1);
    expect(f.lines[0]).toBe("SUPERCALIFRAGILISTICEXPIALIDOCIOUS");
    expect(34 * 0.9 * f.fontSize).toBeLessThanOrEqual(500);
  });
});

describe("posterDate", () => {
  it("souche de la Nocturne : SAM 24 OCT, 19 h", () => {
    const d = posterDate(fromWallTime({ year: 2026, month: 10, day: 24, hour: 19, minute: 0 }));
    expect(d).toEqual({ weekday: "SAM", day: "24", month: "OCT", monthNumber: "10", hour: "19 h" });
    expect(posterDate(fromWallTime({ year: 2026, month: 8, day: 2, hour: 9, minute: 30 })).hour).toBe("9 h 30");
  });
});

describe("schémas de l'affiche", () => {
  it("titre de 34 caractères au plus, style connu", () => {
    expect(posterSettingsSchema.safeParse({ style: "neon", title: "x".repeat(34) }).success).toBe(true);
    expect(posterSettingsSchema.safeParse({ style: "neon", title: "x".repeat(35) }).success).toBe(false);
    expect(posterSettingsSchema.safeParse({ style: "flyer", title: "Rasso" }).success).toBe(false);
  });

  it("aperçu de 540 px au plus", () => {
    const base = { style: "neon", title: "Rasso", date: "2026-10-24T17:00:00.000Z" };
    expect(posterPreviewSchema.parse(base).width).toBe(540);
    expect(posterPreviewSchema.safeParse({ ...base, width: 541 }).success).toBe(false);
  });
});
