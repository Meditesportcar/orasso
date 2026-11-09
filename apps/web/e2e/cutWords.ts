import { expect, type Page } from "@playwright/test";

// Lot R7j : contrôle « aucun mot du titre coupé entre deux lignes », partagé par les recettes de l'appli et du site.

/** Les mots d'un élément coupés entre deux lignes (un mot dont les rectangles n'ont pas le même haut) : doit rester vide. */
export async function cutWords(page: Page, testId: string): Promise<string[]> {
  return page
    .getByTestId(testId)
    .first()
    .evaluate((el) => {
      const out: string[] = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.textContent ?? "";
        for (const m of text.matchAll(/\S+/g)) {
          const r = document.createRange();
          r.setStart(n, m.index ?? 0);
          r.setEnd(n, (m.index ?? 0) + m[0].length);
          const tops = new Set([...r.getClientRects()].map((q) => Math.round(q.top)));
          if (tops.size > 1) out.push(m[0]);
        }
      }
      return out;
    });
}

/**
 * Témoin : un mot volontairement coupé (boîte étroite, coupure partout) que `cutWords` doit relever. Si le contrôle ne le
 * voit pas, il ne voit rien : la recette échoue avant de juger les vrais titres.
 */
export async function expectCutWordsDetected(page: Page): Promise<void> {
  await page.evaluate(() => {
    const witness = document.createElement("div");
    witness.setAttribute("data-testid", "cut-witness");
    witness.style.cssText =
      "position:fixed;left:0;top:0;width:24px;overflow:hidden;word-break:break-all;font:16px sans-serif;";
    witness.textContent = "Rassemblement";
    document.body.appendChild(witness);
  });
  try {
    expect(await cutWords(page, "cut-witness"), "le témoin coupé doit être détecté").toEqual(["Rassemblement"]);
  } finally {
    await page.evaluate(() => document.querySelector('[data-testid="cut-witness"]')?.remove());
  }
}

/** Nombre de lignes de texte d'un élément (rectangles de son texte à des hauteurs différentes) : un libellé de bouton doit tenir sur 1. */
export async function textLines(page: Page, testId: string): Promise<number> {
  return page
    .getByTestId(testId)
    .first()
    .evaluate((el) => {
      const tops = new Set<number>();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!(n.textContent ?? "").trim()) continue;
        const r = document.createRange();
        r.selectNodeContents(n);
        for (const q of r.getClientRects()) tops.add(Math.round(q.top));
      }
      return tops.size;
    });
}
