import { describe, expect, it } from "vitest";
import {
  BUTTON_LABEL_MIN,
  breaksInsideWord,
  flatText,
  nextCut,
  webLabelBreaksInsideWord,
  widthGrew,
} from "./buttonLabelFit";

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

describe("ajustement du libellé, tour 2 (relecture Opus 5)", () => {
  it("clé : le texte à plat, enfants JSX compris", () => {
    expect(flatText("Ajouter en ami")).toBe("Ajouter en ami");
    expect(flatText(["Ajouter ", 2, " amis"])).toBe("Ajouter 2 amis");
    expect(flatText({ props: { children: ["Écrire à ", { props: { children: "Kenji" } }] } })).toBe("Écrire à Kenji");
    expect(flatText(null)).toBe("");
    expect(flatText(false)).toBe("");
    // Deux libellés JSX différents n'ont pas la même clé (un autre texte repart du corps de base).
    expect(flatText({ props: { children: "Suivre" } })).not.toBe(flatText({ props: { children: "Ne plus suivre" } }));
  });

  it("un pixel de moins à chaque coupure, jamais sous le plancher", () => {
    expect(nextCut(14, 0)).toBe(1);
    expect(nextCut(14, 2)).toBe(3);
    expect(nextCut(14, 3)).toBeNull();
    expect(nextCut(11, 0)).toBeNull();
  });

  it("la place qui grandit après une coupure repart de zéro ; la même ou plus petite, non", () => {
    expect(widthGrew(120, 200)).toBe(true);
    expect(widthGrew(120, 120.5)).toBe(false);
    expect(widthGrew(120, 90)).toBe(false);
    expect(widthGrew(null, 300)).toBe(false);
  });

  it("web : un libellé sur une ligne n'est mesuré qu'une fois, pas mot par mot", () => {
    let wordMeasures = 0;
    const node = { textContent: "AJOUTER EN AMI" };
    const lines = (n: number) => Array.from({ length: n }, (_, i) => ({ top: i * 16, width: 40 }));
    const doc = (wholeLines: number, splitWord: string | null) => ({
      createRange() {
        let text = "";
        let whole = false;
        return {
          selectNodeContents() {
            whole = true;
          },
          setStart(_n: unknown, start: number) {
            whole = false;
            text = node.textContent.slice(start);
          },
          setEnd(_n: unknown, end: number) {
            text = node.textContent.slice(node.textContent.length - text.length, end);
          },
          getClientRects() {
            if (whole) return lines(wholeLines);
            wordMeasures++;
            return lines(text === splitWord ? 2 : 1);
          },
        };
      },
      createTreeWalker() {
        let done = false;
        return {
          nextNode: () => {
            if (done) return null;
            done = true;
            return node;
          },
        };
      },
    });
    const g = globalThis as { document?: unknown };
    const before = g.document;
    try {
      g.document = doc(1, null);
      expect(webLabelBreaksInsideWord({})).toBe(false);
      expect(wordMeasures).toBe(0);
      g.document = doc(2, null);
      expect(webLabelBreaksInsideWord({})).toBe(false);
      expect(wordMeasures).toBe(3);
      g.document = doc(2, "AJOUTER");
      expect(webLabelBreaksInsideWord({})).toBe(true);
    } finally {
      g.document = before;
    }
  });
});

describe("nextCut, plancher choisi (lot R6-police)", () => {
  it("descend sous 11 px quand le plancher le permet", () => {
    expect(nextCut(12, 0)).toBe(1);
    expect(nextCut(12, 1)).toBeNull();
    expect(nextCut(12, 1, 8)).toBe(2);
    expect(nextCut(12, 4, 8)).toBeNull();
  });
});
