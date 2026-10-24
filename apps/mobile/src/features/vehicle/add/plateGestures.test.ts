import { describe, expect, it } from "vitest";

import { dragPlateFrame, EDGE_BITS, edgeMask, loupePlace, pickPlateFrame } from "./plateGestures";

// Photo affichée de 300 × 300 px ; cadre de 90 × 36 px centré en (150, 222).
const W = 300;
const H = 300;
const frame = { x: 0.35, y: 0.68, w: 0.3, h: 0.12 };

describe("cadre par modes dans l'appli (lot R4a, maquette R4.1)", () => {
  it("trouve le cadre touché, le dernier posé d'abord, et le geste du mode", () => {
    const other = { x: 0.3, y: 0.66, w: 0.3, h: 0.12 };
    expect(pickPlateFrame([other, frame], 150, 222, W, H, "move")).toMatchObject({ index: 1, kind: "move" });
    expect(pickPlateFrame([frame], 20, 20, W, H, "move")).toBeNull();
    // Rotation : dans le cadre, un toucher seulement (changer de mode) ; sur le bouton de la tige, le geste.
    expect(pickPlateFrame([frame], 150, 222, W, H, "rotate")).toMatchObject({ kind: null, inside: true });
    expect(pickPlateFrame([frame], 150, 204 - 38, W, H, "rotate")).toMatchObject({ kind: "rotate" });
    // Taille : un bord, ou les deux d'un coin.
    expect(pickPlateFrame([frame], 105 - 15, 222, W, H, "size")).toMatchObject({ kind: "size", edges: ["l"] });
    expect(pickPlateFrame([frame], 195 + 10, 240 + 10, W, H, "size")?.edges.sort()).toEqual(["b", "r"]);
  });

  it("Taille : le bord opposé reste fixe", () => {
    const next = dragPlateFrame(frame, "size", ["r"], 30, 0, W, H);
    expect(next.x).toBeCloseTo(frame.x);
    expect(next.w).toBeCloseTo(frame.w + 0.1);
    const up = dragPlateFrame(frame, "size", ["t"], 0, -30, W, H);
    expect(up.y + up.h).toBeCloseTo(frame.y + frame.h);
    expect(up.h).toBeCloseTo(frame.h + 0.1);
  });

  it("Déplacer et Rotation suivent le doigt", () => {
    expect(dragPlateFrame(frame, "move", [], 30, -30, W, H)).toMatchObject({ x: 0.45, y: 0.58 });
    expect(dragPlateFrame(frame, "rotate", [], 56, 56, W, H).angle).toBeGreaterThan(10);
  });

  it("les bords tenus tiennent dans un nombre (lu par le fil UI)", () => {
    expect(edgeMask([])).toBe(0);
    expect(edgeMask(["r", "b"])).toBe(EDGE_BITS.r | EDGE_BITS.b);
  });

  it("la loupe se pose au-dessus du doigt, en dessous en haut de la photo, jamais dehors", () => {
    expect(loupePlace(150, 250, 340, 340)).toEqual({ left: 94, top: 86 });
    expect(loupePlace(150, 60, 340, 340).top).toBe(112);
    expect(loupePlace(5, 250, 340, 340).left).toBe(6);
    expect(loupePlace(338, 250, 340, 340).left).toBe(222);
  });
});
