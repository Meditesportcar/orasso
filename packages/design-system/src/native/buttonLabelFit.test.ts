import { describe, expect, it } from "vitest";
import { BUTTON_LABEL_MIN, breaksInsideWord } from "./buttonLabelFit";

describe("libellé de bouton jamais coupé en plein mot (lot R5b)", () => {
  it("une coupure entre deux mots laisse l'espace en fin de ligne : permise", () => {
    expect(breaksInsideWord(["AJOUTER ", "EN AMI"])).toBe(false);
    expect(breaksInsideWord(["Ajouter en ami"])).toBe(false);
    expect(breaksInsideWord([])).toBe(false);
  });

  it("« AJOUT » / « ER EN AMI » (Xiaomi) : coupure en plein mot", () => {
    expect(breaksInsideWord(["AJOUT", "ER EN AMI"])).toBe(true);
    expect(breaksInsideWord(["AJOUTER ", "EN A", "MI"])).toBe(true);
    expect(breaksInsideWord(["DEMANDE ", "ENVOYÉ", "E"])).toBe(true);
  });

  it("après un trait d'union, une apostrophe ou une ponctuation : permise", () => {
    expect(breaksInsideWord(["PORTE-", "CLÉS"])).toBe(false);
    expect(breaksInsideWord(["D'", "ABORD"])).toBe(false);
    expect(breaksInsideWord(["ÉCRIRE ·", "SIGNALER"])).toBe(false);
  });

  it("le plancher est le plus petit libellé de bouton du système", () => {
    expect(BUTTON_LABEL_MIN).toBe(11);
  });
});
