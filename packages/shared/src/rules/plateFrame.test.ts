import { describe, expect, it } from "vitest";

import {
  DEFAULT_PLATE_FRAME,
  dragRotatePlateFrame,
  isPlateFrameTap,
  movePlateFrame,
  nextPlateFrame,
  nextPlateFrameMode,
  PLATE_EDGE_HIT,
  PLATE_FRAME_FIRST_MODE,
  PLATE_FRAME_MIN_H,
  PLATE_FRAME_MIN_W,
  PLATE_ROTATE_HANDLE_OFFSET,
  plateFrameHit,
  resizeOrientedPlateFrame,
  resizePlateFrame,
  resizePlateFrameEdges,
  rotateKnobBelow,
  rotatePlateFrame,
} from "./plateFrame";

describe("cadre de plaque à la main (lot 51)", () => {
  it("se déplace sans sortir de la photo", () => {
    expect(movePlateFrame(DEFAULT_PLATE_FRAME, 0.1, -0.1)).toEqual({ x: 0.45, y: 0.52, w: 0.3, h: 0.12 });
    expect(movePlateFrame(DEFAULT_PLATE_FRAME, 2, 2)).toEqual({ x: 0.7, y: 0.88, w: 0.3, h: 0.12 });
    expect(movePlateFrame(DEFAULT_PLATE_FRAME, -2, -2)).toEqual({ x: 0, y: 0, w: 0.3, h: 0.12 });
  });

  it("s'agrandit par le coin, jamais au-delà de l'image ni sous la taille minimale", () => {
    expect(resizePlateFrame(DEFAULT_PLATE_FRAME, 0.1, 0.05)).toEqual({ x: 0.35, y: 0.62, w: 0.4, h: 0.17 });
    expect(resizePlateFrame(DEFAULT_PLATE_FRAME, 5, 5)).toEqual({ x: 0.35, y: 0.62, w: 0.65, h: 0.38 });
    expect(resizePlateFrame(DEFAULT_PLATE_FRAME, -5, -5)).toEqual({
      x: 0.35,
      y: 0.62,
      w: PLATE_FRAME_MIN_W,
      h: PLATE_FRAME_MIN_H,
    });
  });

  it("un deuxième cadre ne recouvre pas le premier", () => {
    expect(nextPlateFrame([])).toEqual(DEFAULT_PLATE_FRAME);
    expect(nextPlateFrame([DEFAULT_PLATE_FRAME])).not.toEqual(DEFAULT_PLATE_FRAME);
  });
});

describe("cadre orientable (lot 59c)", () => {
  const r = { x: 0.25, y: 0.25, w: 0.5, h: 0.1 };

  it("angle borné, arrondi, remis droit près de l'horizontale", () => {
    expect(rotatePlateFrame(r, 12.34)).toEqual({ ...r, angle: 12.3 });
    expect(rotatePlateFrame(r, -140)).toEqual({ ...r, angle: -90 });
    expect(rotatePlateFrame({ ...r, angle: 20 }, 1.5)).toEqual(r);
  });

  it("la poignée tourne le cadre autour de son centre", () => {
    // Photo 400 × 200 : cadre de 200 × 20 px, poignée à 10 + 26 = 36 px au-dessus du centre.
    // Doigt déplacé de 36 px vers la droite et 36 vers le bas : poignée à droite du centre, quart de tour.
    expect(dragRotatePlateFrame(r, 36, 36, 200, 26).angle).toBe(90);
    // Vers la gauche, à 45° : −45°.
    expect(dragRotatePlateFrame(r, -36, 0, 200, 26).angle).toBe(-45);
    // Geste minuscule : rien ne bouge.
    expect(dragRotatePlateFrame(r, 0, 0.5, 200)).toEqual(r);
  });

  it("le coin agrandit le long des axes du cadre tourné, coin opposé fixe", () => {
    const tilted = { ...r, angle: 90 };
    // Tourné d'un quart de tour, la largeur du cadre suit l'axe vertical de l'écran.
    const next = resizeOrientedPlateFrame(tilted, 0, 40, 400, 200);
    expect(next.w).toBeCloseTo(0.6, 4);
    expect(next.h).toBeCloseTo(0.1, 4);
    expect(next.angle).toBe(90);
    // Centre déplacé de 20 px vers le bas (moitié de l'agrandissement).
    expect((next.y + next.h / 2) * 200).toBeCloseTo((r.y + r.h / 2) * 200 + 20, 1);
    // Sans angle : comme avant.
    expect(resizeOrientedPlateFrame(r, 40, 20, 400, 200)).toEqual(resizePlateFrame(r, 0.1, 0.1));
    // Jamais sous la taille minimale.
    expect(resizeOrientedPlateFrame(tilted, 0, -1000, 400, 200).w).toBe(PLATE_FRAME_MIN_W);
  });
});

describe("poignée de rotation sous le cadre (lot 59c, tour 2)", () => {
  const r = { x: 0.25, y: 0.02, w: 0.5, h: 0.1 };
  it("même angle que la poignée du haut, geste inversé", () => {
    // Poignée à 36 px sous le centre : tirée de 36 px vers la gauche et 36 vers le haut, elle passe à gauche du centre.
    expect(dragRotatePlateFrame(r, -36, -36, 200, 26, true).angle).toBe(90);
    expect(dragRotatePlateFrame(r, 36, 0, 200, 26, true).angle).toBe(-45);
    expect(dragRotatePlateFrame(r, 0, 0, 200, 26, true)).toEqual(r);
  });
});

describe("cadre par modes (lot R4a, maquette R4.1)", () => {
  // Photo affichée de 400 × 300 px ; cadre droit de 120 × 36 px, centré en (200, 168).
  const W = 400;
  const H = 300;
  const r = { x: 0.35, y: 0.5, w: 0.3, h: 0.12 };

  it("Déplacer → Rotation → Taille → Déplacer, et le cadre rouvre en Déplacer", () => {
    expect(PLATE_FRAME_FIRST_MODE).toBe("move");
    expect(nextPlateFrameMode("move")).toBe("rotate");
    expect(nextPlateFrameMode("rotate")).toBe("size");
    expect(nextPlateFrameMode("size")).toBe("move");
  });

  it("un toucher : moins de 6 px, moins d'une demi-seconde", () => {
    expect(isPlateFrameTap(3, 200)).toBe(true);
    expect(isPlateFrameTap(8, 200)).toBe(false);
    expect(isPlateFrameTap(2, 800)).toBe(false);
  });

  it("Déplacer : dans le cadre ou tout près de son bord, rien au loin", () => {
    expect(plateFrameHit(r, 200, 168, W, H, "move")).toEqual({ kind: "move", edges: [], inside: true });
    expect(plateFrameHit(r, 140 - 8, 168, W, H, "move")).toMatchObject({ kind: "move", inside: false });
    expect(plateFrameHit(r, 20, 20, W, H, "move")).toBeNull();
  });

  it("Rotation : seulement le bouton de la tige, à 38 px au-dessus du cadre ; dessous si le cadre est collé en haut", () => {
    expect(PLATE_ROTATE_HANDLE_OFFSET).toBe(38);
    expect(plateFrameHit(r, 200, 150 - 38, W, H, "rotate")).toMatchObject({ kind: "rotate" });
    expect(plateFrameHit(r, 200, 168, W, H, "rotate")).toEqual({ kind: null, edges: [], inside: true });
    expect(plateFrameHit(r, 320, 168, W, H, "rotate")).toBeNull();
    const top = { x: 0.35, y: 0.02, w: 0.3, h: 0.12 };
    expect(rotateKnobBelow(top, H)).toBe(true);
    expect(plateFrameHit(top, 200, 6 + 36 + 38, W, H, "rotate")).toMatchObject({ kind: "rotate" });
  });

  it("Taille : un bord à 22 px de chaque côté (44 px), un coin tient ses deux bords", () => {
    expect(PLATE_EDGE_HIT * 2).toBe(44);
    expect(plateFrameHit(r, 140 - 20, 168, W, H, "size")).toMatchObject({ kind: "size", edges: ["l"] });
    expect(plateFrameHit(r, 140 + 20, 168, W, H, "size")).toMatchObject({ kind: "size", edges: ["l"] });
    expect(plateFrameHit(r, 140 - 30, 168, W, H, "size")).toBeNull();
    expect(plateFrameHit(r, 262, 188, W, H, "size")?.edges).toEqual(["r", "b"]);
    // Cadre plus bas que deux zones (36 px) : dans sa hauteur, le côté ; le haut s'attrape au milieu ou au-dessus.
    expect(plateFrameHit(r, 200, 160, W, H, "size")?.edges).toEqual(["t"]);
    expect(plateFrameHit(r, 200, 140, W, H, "size")?.edges).toEqual(["t"]);
    expect(plateFrameHit(r, 130, 140, W, H, "size")?.edges).toEqual(["l", "t"]);
  });

  it("Taille : le bord opposé reste fixe, la taille minimale et la photo bornent", () => {
    const right = resizePlateFrameEdges(r, ["r"], 40, 0, W, H);
    expect(right.x).toBeCloseTo(r.x);
    expect(right.w).toBeCloseTo(r.w + 0.1);
    const left = resizePlateFrameEdges(r, ["l"], -40, 0, W, H);
    expect(left.x + left.w).toBeCloseTo(r.x + r.w);
    const corner = resizePlateFrameEdges(r, ["r", "b"], 40, 30, W, H);
    expect(corner).toMatchObject({ x: r.x, y: r.y });
    expect(corner.h).toBeCloseTo(r.h + 0.1);
    const tiny = resizePlateFrameEdges(r, ["r"], -1000, 0, W, H);
    expect(tiny.w).toBeCloseTo(PLATE_FRAME_MIN_W);
    expect(tiny.x).toBeCloseTo(r.x);
    const wide = resizePlateFrameEdges(r, ["r"], 1000, 0, W, H);
    expect(wide.x).toBeCloseTo(r.x);
    expect(wide.x + wide.w).toBeCloseTo(1);
  });

  it("Taille d'un cadre tourné : suit ses axes, le bord opposé reste en place", () => {
    const tilted = { ...r, angle: 90 };
    // Tourné d'un quart de tour, son bord « droit » est en bas : tirer vers le bas l'allonge.
    const next = resizePlateFrameEdges(tilted, ["r"], 0, 40, W, H);
    expect(next.angle).toBe(90);
    expect(next.w * W).toBeCloseTo(r.w * W + 40);
    // Le bord « gauche » (en haut à l'écran) ne bouge pas : le centre descend de 20 px.
    expect((next.y + next.h / 2) * H).toBeCloseTo(168 + 20, 1);
  });
});

describe("Taille d'un cadre tourné : la plaque masquée reste masquée (lot R4a, tour 2)", () => {
  const W = 400;
  const H = 300;
  /** Coins et centre d'un cadre, en px de la photo. */
  const points = (r: { x: number; y: number; w: number; h: number; angle?: number }) => {
    const a = ((r.angle ?? 0) * Math.PI) / 180;
    const cx = (r.x + r.w / 2) * W;
    const cy = (r.y + r.h / 2) * H;
    const hw = (r.w * W) / 2;
    const hh = (r.h * H) / 2;
    return [
      [0, 0],
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ].map(([u, v]) => [
      cx + (u ?? 0) * Math.cos(a) - (v ?? 0) * Math.sin(a),
      cy + (u ?? 0) * Math.sin(a) + (v ?? 0) * Math.cos(a),
    ]);
  };
  /** Le point (px) est dans le cadre, à un demi-pixel près. */
  const inside = (r: { x: number; y: number; w: number; h: number; angle?: number }, [px, py]: number[]) => {
    const a = ((r.angle ?? 0) * Math.PI) / 180;
    const dx = (px ?? 0) - (r.x + r.w / 2) * W;
    const dy = (py ?? 0) - (r.y + r.h / 2) * H;
    const lx = dx * Math.cos(a) + dy * Math.sin(a);
    const ly = -dx * Math.sin(a) + dy * Math.cos(a);
    return Math.abs(lx) <= (r.w * W) / 2 + 0.5 && Math.abs(ly) <= (r.h * H) / 2 + 0.5;
  };
  const outward: Record<string, [number, number]> = { l: [-1, 0], r: [1, 0], t: [0, -1], b: [0, 1] };

  it("cas de la relecture : bord gauche d'un cadre à 45° tiré loin vers le haut à gauche", () => {
    const start = { x: 0.35, y: 0.5, w: 0.3, h: 0.12, angle: 45 };
    const next = resizePlateFrameEdges(start, ["l"], -200, -200, W, H);
    for (const p of points(start)) expect(inside(next, p)).toBe(true);
    expect(next.x).toBeGreaterThanOrEqual(0);
    expect(next.y + next.h).toBeLessThanOrEqual(1);
  });

  it("plusieurs angles, bords et positions, jusqu'aux limites de la photo", () => {
    const starts = [
      { x: 0.35, y: 0.5, w: 0.3, h: 0.12 },
      { x: 0.02, y: 0.03, w: 0.25, h: 0.1 },
      { x: 0.7, y: 0.85, w: 0.28, h: 0.12 },
    ];
    for (const base of starts) {
      for (const angle of [0, 12, 45, -60, 90, -89]) {
        const start = angle ? { ...base, angle } : base;
        for (const edges of [["l"], ["r"], ["t"], ["b"], ["l", "t"], ["r", "b"]] as const) {
          for (const d of [10, 80, 600]) {
            // Vers l'extérieur, dans les axes du cadre.
            let ux = 0;
            let uy = 0;
            for (const e of edges) {
              ux += outward[e]?.[0] ?? 0;
              uy += outward[e]?.[1] ?? 0;
            }
            const a = (angle * Math.PI) / 180;
            const dx = d * (ux * Math.cos(a) - uy * Math.sin(a));
            const dy = d * (ux * Math.sin(a) + uy * Math.cos(a));
            const next = resizePlateFrameEdges(start, edges, dx, dy, W, H);
            const label = JSON.stringify({ start, edges, d });
            for (const p of points(start)) expect(inside(next, p), label).toBe(true);
            expect(next.x, label).toBeGreaterThanOrEqual(0);
            expect(next.y, label).toBeGreaterThanOrEqual(0);
            expect(next.x + next.w, label).toBeLessThanOrEqual(1 + 1e-9);
            expect(next.y + next.h, label).toBeLessThanOrEqual(1 + 1e-9);
          }
        }
      }
    }
  });
});
