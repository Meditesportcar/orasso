import { describe, expect, it } from "vitest";
import {
  CAPCHIP_GAP,
  CAPCHIP_LOGO,
  CAPCHIP_PAD_LEFT,
  CAPCHIP_PAD_RIGHT,
  capChipCompact,
  capChipRoom,
  capChipTextWidth,
} from "./capChipFit";

// Correctif R4 (vérification d'ensemble, 24/10) : à 390 px, « ORGANISAT… » ; un libellé ne se coupe jamais. La pastille
// montre le rôle en entier quand il tient, sinon le logo rond ; la Boîte reste dans l'écran (lot C7).
const ROLES = ["Organisateur", "Administration", "Modération", "Prestataire", "Staff", "Média", "Pro"];
const chipWidth = (role: string, fontScale = 1) =>
  CAPCHIP_PAD_LEFT + CAPCHIP_LOGO + CAPCHIP_GAP + capChipTextWidth(role, fontScale) + CAPCHIP_PAD_RIGHT;

describe("pastille de casquette : rôle entier ou logo rond", () => {
  it("« Organisateur » tient en entier à 390 px, comme dans l'artefact", () => {
    expect(capChipCompact({ width: 390, role: "Organisateur" })).toBe(false);
    expect(capChipCompact({ width: 412, role: "Organisateur" })).toBe(false);
  });

  it("sous 390 px, « Organisateur » passe au logo rond", () => {
    expect(capChipCompact({ width: 389, role: "Organisateur" })).toBe(true);
    expect(capChipCompact({ width: 360, role: "Organisateur" })).toBe(true);
  });

  it("« Administration » : logo rond à 360 et 390 px, entier à 412 px", () => {
    expect(capChipCompact({ width: 360, role: "Administration" })).toBe(true);
    expect(capChipCompact({ width: 390, role: "Administration" })).toBe(true);
    expect(capChipCompact({ width: 412, role: "Administration" })).toBe(false);
  });

  it("les rôles courts restent en entier sur un écran étroit", () => {
    for (const role of ["Staff", "Média", "Pro"]) expect(capChipCompact({ width: 360, role })).toBe(false);
    expect(capChipCompact({ width: 390, role: "Modération" })).toBe(false);
    expect(capChipCompact({ width: 390, role: "Prestataire" })).toBe(false);
  });

  it("jamais de « … » : quand le rôle est montré, la pastille tient dans la place, Boîte comprise", () => {
    for (const role of ROLES) {
      for (const fontScale of [1, 1.1, 1.3, 2]) {
        for (let width = 320; width <= 480; width++) {
          for (const withClose of [false, true]) {
            if (capChipCompact({ width, fontScale, role, withClose })) continue;
            expect(chipWidth(role, fontScale), `${role} à ${width} px (×${fontScale})`).toBeLessThanOrEqual(
              capChipRoom(width, withClose),
            );
          }
        }
      }
    }
  });

  it("le texte agrandi (jusqu'à ×1,2) peut faire passer au logo rond", () => {
    expect(capChipCompact({ width: 390, fontScale: 1.2, role: "Organisateur" })).toBe(true);
    expect(capChipCompact({ width: 480, fontScale: 1.2, role: "Organisateur" })).toBe(false);
    // Au-delà de 1,2, le texte ne grandit plus (`maxFontSizeMultiplier`).
    expect(capChipTextWidth("Organisateur", 2)).toBe(capChipTextWidth("Organisateur", 1.2));
  });

  it("un ✕ sur la barre prend sa place à la pastille", () => {
    expect(capChipRoom(390, true)).toBe(capChipRoom(390) - 48);
    expect(capChipCompact({ width: 390, role: "Organisateur", withClose: true })).toBe(true);
  });

  it("un rôle inconnu n'est jamais sous-estimé (0,8 em par signe), et sans rôle : logo rond", () => {
    expect(capChipTextWidth("Organisateur")).toBeLessThan(capChipTextWidth("Xxxxxxxxxxxx"));
    expect(capChipCompact({ width: 480 })).toBe(true);
  });
});
