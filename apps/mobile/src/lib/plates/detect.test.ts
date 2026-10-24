import type { PlateRect } from "@orasso/shared";
import { describe, expect, it } from "vitest";

import {
  detectPlates,
  detectWithRetry,
  findPlates,
  looksLikePlate,
  normalizePlateText,
  orientedPlateRect,
  plateReadingOf,
  platesFromLines,
  probablePlate,
  readPlate,
  suggestedPlate,
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

describe("plaque penchée au bord de la photo : toute la plaque visible reste dans le cadre (lot 59c, tour 2)", () => {
  const W = 1000;
  const H = 800;
  const quad = (cx: number, cy: number, w: number, h: number, deg: number) => {
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
  /** Contrôle indépendant : 41 × 41 points de la plaque, ceux qui sont dans la photo doivent être dans le cadre. */
  const uncovered = (r: PlateRect, cx: number, cy: number, w: number, h: number, deg: number) => {
    const t = (deg * Math.PI) / 180;
    const a = ((r.angle ?? 0) * Math.PI) / 180;
    const fx = (r.x + r.w / 2) * W;
    const fy = (r.y + r.h / 2) * H;
    let out = 0;
    for (let i = 0; i <= 40; i++) {
      for (let j = 0; j <= 40; j++) {
        const dx = (i / 40 - 0.5) * w;
        const dy = (j / 40 - 0.5) * h;
        const x = cx + dx * Math.cos(t) - dy * Math.sin(t);
        const y = cy + dx * Math.sin(t) + dy * Math.cos(t);
        if (x < 0 || y < 0 || x > W || y > H) continue;
        const u = (x - fx) * Math.cos(a) + (y - fy) * Math.sin(a);
        const v = -(x - fx) * Math.sin(a) + (y - fy) * Math.cos(a);
        if (Math.abs(u) > (r.w * W) / 2 + 1e-6 || Math.abs(v) > (r.h * H) / 2 + 1e-6) out++;
      }
    }
    return out;
  };
  const detect = (cx: number, cy: number, deg: number) => {
    const corners = quad(cx, cy, 200, 40, deg);
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const f = frame(left, top, Math.max(...xs) - left, Math.max(...ys) - top);
    const rects = platesFromLines([{ text: "GA-662-KS", elements: [{ text: "GA-662-KS", frame: f, corners }] }], W, H);
    expect(rects).toHaveLength(1);
    return rects[0] as PlateRect;
  };

  it("cas des relectures : 200 × 40 centrée en (90, 100), 45°", () => {
    expect(uncovered(detect(90, 100, 45), 90, 100, 200, 40, 45)).toBe(0);
  });

  const places: [string, number, number][] = [
    ["bord gauche", 60, 400],
    ["bord droit", 940, 400],
    ["bord haut", 500, 25],
    ["bord bas", 500, 775],
    ["coin haut gauche", 70, 40],
    ["coin haut droit", 930, 40],
    ["coin bas gauche", 70, 760],
    ["coin bas droit", 930, 760],
    ["au milieu", 500, 400],
  ];
  for (const [where, cx, cy] of places) {
    for (const deg of [30, 45, 60, 89, -30, -45, -60, -89]) {
      it(`${where}, ${deg}° : aucun point de la plaque hors du cadre`, () => {
        expect(uncovered(detect(cx, cy, deg), cx, cy, 200, 40, deg)).toBe(0);
      });
    }
  }

  it("au milieu, le cadre reste orienté", () => {
    expect(detect(500, 400, 30).angle).toBe(30);
  });
});

describe("tous les formats français et filet de sécurité (lot M2)", () => {
  it("W garage, WW provisoire et diplomatiques sont reconnus, avec leur lecture", () => {
    const cases: [string, string][] = [
      ["W-623-AX", "W623AX"], // la Nissan de Damien (retour 11)
      ["W 623 AX", "W623AX"],
      ["W-6Z3-AX", "W623AX"], // Z lu pour 2
      ["WW-123-AB", "WW123AB"],
      ["FT-340-NC", "FT340NC"], // la BMW (retour 12)
      ["1234 AB 66", "1234AB66"],
      ["12 CD 3456", "12CD3456"],
      ["6 CMD 15", "6CMD15"],
      ["F GA-662-KS 66", "GA662KS"],
      ["GA-662-KS 974", "GA662KS"],
      ["F W 623 AX 66", "W623AX"],
    ];
    for (const [text, reading] of cases) {
      expect(looksLikePlate(text), text).toBe(true);
      expect(plateReadingOf(text), text).toBe(reading);
    }
  });

  it("une FNI lue exactement passe devant une SIV obtenue en relisant (« 256 BB 88 »)", () => {
    expect(readPlate("256 BB 88")).toMatchObject({ plate: "256BB88", fixes: 0, valid: true, ambiguous: false });
  });

  it("la plaque W garage lue en trois mots donne un cadre et un numéro prérempli", () => {
    const lines = [
      line([
        ["W", frame(400, 600, 30, 40)],
        ["623", frame(440, 600, 80, 40)],
        ["AX", frame(530, 600, 60, 40)],
      ]),
    ];
    const found = findPlates(lines, 1000, 1000);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ plate: "W623AX", probable: false, ambiguous: false });
    expect(suggestedPlate(found)).toBe("W-623-AX");
  });

  it("bande « F » et département lus en mots à part : W garage, cadre sur toute la plaque (Codex)", () => {
    const lines = [
      line([
        ["F", frame(380, 600, 15, 40)],
        ["W", frame(400, 600, 30, 40)],
        ["623", frame(440, 600, 80, 40)],
        ["AX", frame(530, 600, 60, 40)],
        ["66", frame(600, 600, 20, 40)],
      ]),
    ];
    const [plate] = findPlates(lines, 1000, 1000);
    expect(plate?.plate).toBe("W623AX");
    expect(suggestedPlate([plate!])).toBe("W-623-AX");
    // Cadre des cinq mots (380 → 620), agrandi de 15 %.
    expect(plate?.rect.w).toBeCloseTo(0.276, 3);
  });

  it("tour 3 : une sous-suite mieux lue ne réduit jamais le cadre et rend le numéro ambigu (« A8 123 CD 66 »)", () => {
    const words = (texts: string[]) => {
      let x = 300;
      return texts.map((t): [string, TextFrame] => {
        const f = frame(x, 600, t.length * 20, 40);
        x += t.length * 20 + 10;
        return [t, f];
      });
    };
    for (const texts of [
      ["A8", "123", "CD", "66"],
      ["F", "A8", "123", "CD", "66"],
    ]) {
      const ws = words(texts);
      const [plate, ...rest] = findPlates([line(ws)], 1000, 1000);
      expect(rest, texts.join(" ")).toEqual([]);
      expect(plate).toMatchObject({ plate: "AB123CD", ambiguous: true, probable: false });
      expect(suggestedPlate([plate!]), texts.join(" ")).toBeNull();
      // Cadre : toute la ligne, du premier au dernier mot (agrandi de 15 %), jamais la seule sous-suite.
      const left = ws[0]![1].left;
      const right = ws.at(-1)![1].left + ws.at(-1)![1].width;
      expect(plate!.rect.x).toBeLessThanOrEqual(left / 1000);
      expect(plate!.rect.x + plate!.rect.w).toBeGreaterThanOrEqual(right / 1000);
    }
  });

  it("tour 4 : plaque et texte de carrosserie sur une ligne : la plaque sûre garde son cadre, à part", () => {
    const cases: [string[], number, number, string][] = [
      // [mots, premier et dernier mot de la plaque (exclu), numéro]
      [["AB-123-CD", "PORSCHE", "911", "TURBO"], 0, 1, "AB-123-CD"],
      [["AB", "123", "CD", "PORSCHE", "911", "TURBO"], 0, 3, "AB-123-CD"],
      [["GT3", "RS", "FT-340-NC"], 2, 3, "FT-340-NC"],
      [["W-623-AX", "350Z", "NISMO", "LE", "MANS", "24"], 0, 1, "W-623-AX"],
      // Tour 5 : une lecture probable (« CD 66 911 ») ne relie pas la plaque au badge « 911 TURBO ».
      [["AB", "123", "CD", "66", "911", "TURBO"], 0, 4, "AB-123-CD"],
      [["F", "AB", "123", "CD", "66", "911", "TURBO"], 0, 5, "AB-123-CD"],
    ];
    for (const [texts, from, to, number] of cases) {
      let x = 50;
      const ws = texts.map((t): [string, TextFrame] => {
        const f = frame(x, 600, t.length * 18, 40);
        x += t.length * 18 + 12;
        return [t, f];
      });
      const lines = [line(ws)];
      const found = findPlates(lines, 1000, 1000);
      const sure = found.filter((f) => !f.probable);
      expect(sure, texts.join(" ")).toHaveLength(1);
      expect(suggestedPlate(found), texts.join(" ")).toBe(number);
      // Le cadre couvre la plaque, sans déborder sur le mot suivant.
      const rect = platesFromLines(lines, 1000, 1000);
      expect(rect, texts.join(" ")).toHaveLength(1);
      const left = ws[from]![1].left;
      const right = ws[to - 1]![1].left + ws[to - 1]![1].width;
      expect(rect[0]!.x, texts.join(" ")).toBeLessThanOrEqual(left / 1000);
      expect(rect[0]!.x + rect[0]!.w, texts.join(" ")).toBeGreaterThanOrEqual(right / 1000);
      const next = ws[to]?.[1];
      if (next) expect(rect[0]!.x + rect[0]!.w, texts.join(" ")).toBeLessThan((next.left + next.width / 2) / 1000);
    }
  });

  it("tour 3 : « F » lu à part = bande (W garage) ; collé = SIV de série FW", () => {
    expect(plateReadingOf("F W 123 AB")).toBe("W123AB");
    expect(plateReadingOf("F W 123 AB 66")).toBe("W123AB");
    expect(plateReadingOf("FW 123 AB")).toBe("FW123AB");
    expect(plateReadingOf("FW-123-AB 66")).toBe("FW123AB");
    expect(plateReadingOf("F FW 123 AB 66")).toBe("FW123AB");
  });

  it("numéro prérempli : la lecture exacte d'abord, le plus grand cadre ensuite, rien s'il y a ambiguïté", () => {
    const at = (plate: string, fixes: number, area: number) => ({
      plate,
      fixes,
      valid: true,
      ambiguous: false,
      probable: false,
      area,
    });
    expect(suggestedPlate([at("ZS688BB", 4, 0.02), at("256BB88", 0, 0.01)])).toBe("256 BB 88");
    expect(suggestedPlate([at("AB123CD", 0, 0.02), at("GA662KS", 0, 0.005)])).toBe("AB-123-CD");
    expect(suggestedPlate([at("AB123CD", 0, 0.02), at("GA662KS", 0, 0.018)])).toBeNull();
    expect(suggestedPlate([at("AB123CD", 0, 0.02), at("AB123CD", 0, 0.018)])).toBe("AB-123-CD");
    expect(suggestedPlate([{ ...at("AB123CD", 0, 0.02), ambiguous: true }])).toBeNull();
  });

  it("filet de sécurité : 5 à 9 lettres et chiffres dans un rectangle de plaque = plaque probable, jamais appliquée", () => {
    expect(probablePlate("M AB 1234", frame(0, 0, 250, 50))).toBe("MAB1234"); // plaque allemande, 5:1
    expect(probablePlate("M AB 1234", frame(0, 0, 100, 100))).toBeNull(); // carré : pas une plaque
    expect(probablePlate("TOYOTA", frame(0, 0, 250, 50))).toBeNull(); // pas de chiffre
    expect(probablePlate("2026", frame(0, 0, 250, 50))).toBeNull(); // trop court, pas de lettre
    expect(probablePlate("ABCDEF1234", frame(0, 0, 400, 50))).toBeNull(); // 10 caractères
    const lines = [line([["M-AB-1234", frame(300, 500, 250, 50)]]), line([["GA-662-KS", frame(300, 800, 250, 50)]])];
    const found = findPlates(lines, 1000, 1000);
    expect(found.map((f) => [f.plate, f.probable])).toEqual([
      ["GA662KS", false],
      ["MAB1234", true],
    ]);
    expect(platesFromLines(lines, 1000, 1000)).toHaveLength(1); // seul le cadre de la plaque reconnue
    expect(suggestedPlate(found)).toBe("GA-662-KS");
    expect(suggestedPlate(found.slice(1))).toBeNull(); // une probable seule ne préremplit rien
    expect(suggestedPlate([])).toBeNull();
  });

  it("faux positifs : badges et inscriptions de carrosserie ne deviennent ni cadre ni numéro", () => {
    const badges = [
      "GT3 RS",
      "RS6 AVANT",
      "C63 AMG",
      "LE MANS 24",
      "AMG GT63S",
      "GTI16V",
      "BMW320D",
      "24H LEMANS",
      "911 TURBO",
      "RASSO 2026",
    ];
    for (const text of badges) {
      const lines = [line([[text, frame(300, 500, 250, 50)]])]; // proportions d'une plaque (5:1)
      const found = findPlates(lines, 1000, 1000);
      expect(platesFromLines(lines, 1000, 1000), text).toEqual([]);
      expect(suggestedPlate(found), text).toBeNull();
      expect(
        found.every((f) => f.probable),
        text,
      ).toBe(true);
    }
  });
});

describe("lot R3a : plaque de Damien (« EJ-706-EW », bande F et 66), lectures probables de ML Kit", () => {
  const at = (words: string[]) => line(words.map((w, i): [string, TextFrame] => [w, frame(560 + i * 70, 560, 60, 30)]));
  const cases: string[][] = [
    ["EJ-706-EW"],
    ["F", "EJ-706-EW", "66"],
    ["F", "EJ-706-EW"],
    ["EJ-706-EW", "66"],
    ["EJ·706·EW"],
    ["EJ-706-EW66"],
    ["EJ", "706", "EW"],
    ["EJ–706–EW"],
    ["EJ—706—EW"],
    ["FEJ-706-EW"],
    ["EJ.706.EW"],
    ["EJ-706-EW|66"],
    ["EJ-7O6-EW"],
    ["EJ706EW"],
    // Tour R3a : la bande bleue collée lue « I » ou « L », et le W large lu « VV ».
    ["IEJ-706-EW"],
    ["IEJ-706-EW66"],
    ["L", "EJ-706-EW"],
    ["EJ-706-EVV"],
  ];
  it.each(cases)("%s → cadre posé et numéro prérempli « EJ-706-EW »", (...words: string[]) => {
    const found = findPlates([at(words)], 922, 922);
    expect(found.filter((f) => !f.probable)).toHaveLength(1);
    expect(suggestedPlate(found)).toBe("EJ-706-EW");
  });
  it("chaque ligne à part (bloc « F », bloc plaque, bloc « 66 ») : une seule plaque", () => {
    const found = findPlates([at(["F"]), at(["EJ-706-EW"]), at(["66"])], 922, 922);
    expect(found.map((f) => f.plate)).toEqual(["EJ706EW"]);
  });
  it("le caractère de tête n'est retiré que devant une plaque récente : une FNI garde son premier chiffre", () => {
    expect(readPlate("1234 AB 66")?.plate).toBe("1234AB66");
    expect(readPlate("LEJ706EW")?.plate).toBe("EJ706EW");
  });
});

describe("lot R3a : raison d'un échec et second essai sur une copie réduite", () => {
  const plateLine = (scale: number) => line([["EJ-706-EW", frame(560 * scale, 560 * scale, 180 * scale, 40 * scale)]]);
  const shrink = async (_uri: string, w: number, h: number, side: number) => {
    const k = side / Math.max(w, h);
    return { uri: "petite", width: Math.round(w * k), height: Math.round(h * k) };
  };
  it("lecture réussie du premier coup : pas de second essai", async () => {
    const calls: string[] = [];
    const r = await detectWithRetry("grande", 1600, 1600, {
      recognize: async (uri) => (calls.push(uri), { status: "ok", lines: [plateLine(1)] }),
      shrink,
    });
    expect(calls).toEqual(["grande"]);
    expect(r.retried).toBe(false);
    expect(r.failure).toBeUndefined();
    expect(r.found?.map((f) => f.plate)).toEqual(["EJ706EW"]);
  });
  it("aucune ligne sur la grande photo : second essai sur la copie, cadres normalisés identiques", async () => {
    const calls: string[] = [];
    const r = await detectWithRetry("grande", 1600, 1600, {
      recognize: async (uri) => {
        calls.push(uri);
        return uri === "grande" ? { status: "ok", lines: [] } : { status: "ok", lines: [plateLine(1024 / 1600)] };
      },
      shrink,
    });
    expect(calls).toEqual(["grande", "petite"]);
    expect(r.retried).toBe(true);
    expect(r.failure).toBeUndefined();
    const direct = findPlates([plateLine(1)], 1600, 1600)[0]?.rect;
    const rect = r.found?.[0]?.rect;
    expect(rect?.x).toBeCloseTo(direct?.x ?? -1, 3);
    expect(rect?.w).toBeCloseTo(direct?.w ?? -1, 3);
  });
  it("erreur de ML Kit puis rien sur la copie : la raison est l'erreur ; aucune ligne nulle part : « no-text »", async () => {
    const failing = await detectWithRetry("grande", 1600, 1600, {
      recognize: async (uri) =>
        uri === "grande" ? { status: "error", code: "MlKitException" } : { status: "ok", lines: [] },
      shrink,
    });
    expect(failing).toMatchObject({ found: null, failure: "error:MlKitException", retried: true });
    const empty = await detectWithRetry("grande", 1600, 1600, {
      recognize: async () => ({ status: "ok", lines: [] }),
      shrink,
    });
    expect(empty).toMatchObject({ found: [], failure: "no-text", retried: true });
  });
  it("module absent : pas de second essai ; petite photo : pas de copie", async () => {
    let calls = 0;
    const absent = await detectWithRetry("grande", 1600, 1600, {
      recognize: async () => (calls++, { status: "absent" }),
      shrink,
    });
    expect(absent).toMatchObject({ found: null, failure: "absent", retried: false });
    expect(calls).toBe(1);
    const small = await detectWithRetry("petite", 900, 900, {
      recognize: async () => ({ status: "ok", lines: [] }),
      shrink,
    });
    expect(small).toMatchObject({ found: [], failure: "no-text", retried: false });
  });
});
