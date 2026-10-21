import { describe, expect, it } from "vitest";

import {
  detectPlates,
  looksLikePlate,
  normalizePlateText,
  orientedPlateRect,
  platesFromLines,
  toPlateRect,
} from "./detect";
import type { TextFrame, TextLineResult } from "./mlkit";

const frame = (left: number, top: number, width: number, height: number): TextFrame => ({ left, top, width, height });
const line = (words: [string, TextFrame][]): TextLineResult => ({
  text: words.map(([w]) => w).join(" "),
  frame: {
    left: Math.min(...words.map(([, f]) => f.left)),
    top: Math.min(...words.map(([, f]) => f.top)),
    width: Math.max(...words.map(([, f]) => f.left + f.width)) - Math.min(...words.map(([, f]) => f.left)),
    height: Math.max(...words.map(([, f]) => f.top + f.height)) - Math.min(...words.map(([, f]) => f.top)),
  },
  elements: words.map(([text, f]) => ({ text, frame: f })),
});

describe("plateRegex : looksLikePlate", () => {
  it("normalise : majuscules, lettres et chiffres", () => {
    expect(normalizePlateText(" ga-662 ks ")).toBe("GA662KS");
  });

  it("reconnaît les plaques SIV et FNI", () => {
    for (const p of ["GA-662-KS", "AB 123 CD", "ab123cd", "1234 AB 66", "123-ABC-2A", "12 A 974", "F GA-662-KS 66"]) {
      expect(looksLikePlate(p), p).toBe(true);
    }
  });

  it("tolère les confusions de lecture (O/0, I/1, B/8, S/5)", () => {
    expect(looksLikePlate("GA-66Z-K5")).toBe(true); // Z lu pour 2, 5 lu pour S
    expect(looksLikePlate("6A-O62-KS")).toBe(true); // 6 lu pour G, O lu pour 0
    expect(looksLikePlate("1Z34 AB 66")).toBe(true);
  });

  it("refuse ce qui n'est pas une plaque", () => {
    for (const p of [
      "",
      "AB12",
      "TOYOTA",
      "BONJOUR",
      "SUPRA GR",
      "0612345678",
      "OOOOOOO",
      "8888888",
      "www.orasso.fr",
    ]) {
      expect(looksLikePlate(p), p).toBe(false);
    }
  });
});

describe("rectangles proposés", () => {
  it("agrandit de 15 % autour du centre, normalisé et borné à l'image", () => {
    expect(toPlateRect(frame(100, 100, 200, 40), 1000, 500)).toEqual({ x: 0.085, y: 0.194, w: 0.23, h: 0.092 });
    const edge = toPlateRect(frame(0, 480, 100, 20), 1000, 500);
    expect(edge.x).toBe(0);
    expect(edge.y + edge.h).toBeLessThanOrEqual(1);
  });

  it("assemble les mots d'une plaque lue en trois morceaux et ignore le reste", () => {
    const lines = [
      line([["TOYOTA", frame(40, 40, 200, 30)]]),
      line([
        ["GA", frame(400, 600, 60, 40)],
        ["662", frame(470, 600, 80, 40)],
        ["KS", frame(560, 600, 60, 40)],
      ]),
      line([["Concession", frame(40, 900, 300, 30)]]),
    ];
    const rects = platesFromLines(lines, 1000, 1000);
    expect(rects).toHaveLength(1);
    const [r] = rects;
    // Cadre des trois mots (400 → 620, 600 → 640), agrandi de 15 %.
    expect(r?.x).toBeCloseTo((510 - 110 * 1.15) / 1000, 3);
    expect(r?.w).toBeCloseTo(0.253, 3);
    expect(r?.h).toBeCloseTo(0.046, 3);
  });

  it("quatre plaques au plus", () => {
    const lines = Array.from({ length: 6 }, (_, i) => line([[`AB-12${i}-CD`, frame(10, 10 + i * 100, 100, 30)]]));
    expect(platesFromLines(lines, 1000, 1000)).toHaveLength(4);
  });

  it("sans ML Kit (web, tests) : null, l'écran passe à la main", async () => {
    expect(await detectPlates("file:///photo.jpg", 1200, 900)).toBeNull();
    expect(await detectPlates("file:///photo.jpg", 0, 0)).toBeNull();
  });
});

describe("plaque penchée : cadre orienté par les coins de ML Kit (lot 59c)", () => {
  /** Coins d'un rectangle de `w × h` centré en (cx, cy), tourné de `deg` degrés. */
  const rotated = (cx: number, cy: number, w: number, h: number, deg: number) => {
    const t = (deg * Math.PI) / 180;
    const pts: [number, number][] = [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ];
    return pts.map(([dx, dy]) => ({
      x: cx + dx * Math.cos(t) - dy * Math.sin(t),
      y: cy + dx * Math.sin(t) + dy * Math.cos(t),
    }));
  };

  it("angle du bord haut, taille dans le repère tourné, agrandie de 15 %", () => {
    const r = orientedPlateRect([rotated(500, 400, 200, 40, 10)], 1000, 800);
    expect(r?.angle).toBe(10);
    expect(r?.w).toBeCloseTo(0.23, 3);
    expect(r?.h).toBeCloseTo(0.0575, 3);
    // Centre conservé.
    expect(((r?.x ?? 0) + (r?.w ?? 0) / 2) * 1000).toBeCloseTo(500, 0);
    expect(((r?.y ?? 0) + (r?.h ?? 0) / 2) * 800).toBeCloseTo(400, 0);
  });

  it("presque droite (moins de 2°) ou coins absents : cadre droit", () => {
    expect(orientedPlateRect([rotated(500, 400, 200, 40, 1)], 1000, 800)).toBeNull();
    expect(orientedPlateRect([], 1000, 800)).toBeNull();
  });

  it("trois mots penchés : un seul cadre orienté qui les contient tous", () => {
    const deg = -12;
    const t = (deg * Math.PI) / 180;
    const elements = (
      [
        ["GA", 420],
        ["662", 500],
        ["KS", 580],
      ] as const
    ).map(([text, along]) => {
      const corners = rotated(500 + (along - 500) * Math.cos(t), 600 + (along - 500) * Math.sin(t), 60, 40, deg);
      const xs = corners.map((p) => p.x);
      const ys = corners.map((p) => p.y);
      const left = Math.min(...xs);
      const top = Math.min(...ys);
      return { text, corners, frame: frame(left, top, Math.max(...xs) - left, Math.max(...ys) - top) };
    });
    const rects = platesFromLines([{ text: "GA 662 KS", elements }], 1000, 1000);
    expect(rects).toHaveLength(1);
    expect(rects[0]?.angle).toBe(-12);
    // 220 px le long de la plaque (de 390 à 610), agrandis de 15 %.
    expect(rects[0]?.w).toBeCloseTo(0.253, 2);
  });
});
