// Libellé de bouton jamais coupé au milieu d'un mot (lot R5b, « AJOUT/ER EN AMI » sur le Xiaomi). Pur, sans React
// Native : la détection d'une coupure en plein mot, à partir des lignes telles que le système les a posées.

/** Le plus petit libellé de bouton du système (rangée de trois du tri et du staff, secours du staff) : 11 px. */
export const BUTTON_LABEL_MIN = 11;

const ENDS_IN_WORD = /[\p{L}\p{N}]$/u;
const STARTS_IN_WORD = /^[\p{L}\p{N}]/u;

/**
 * Une ligne finit-elle au milieu d'un mot ? Les lignes sont celles du système (`onTextLayout`) : une coupure entre deux
 * mots laisse l'espace en fin de ligne (« AJOUTER  » / « EN AMI ») ; une coupure en plein mot laisse une lettre de
 * chaque côté (« AJOUT » / « ER EN AMI »). Une coupure après un trait d'union ou une apostrophe reste permise.
 */
export function breaksInsideWord(lines: readonly string[]): boolean {
  for (let i = 0; i < lines.length - 1; i++) {
    if (ENDS_IN_WORD.test(lines[i] ?? "") && STARTS_IN_WORD.test(lines[i + 1] ?? "")) return true;
  }
  return false;
}

type WebRect = { top: number; width: number };
type WebRange = {
  setStart(node: unknown, offset: number): void;
  setEnd(node: unknown, offset: number): void;
  getClientRects(): ArrayLike<WebRect>;
};
type WebTextNode = { textContent: string | null };
type WebDocument = {
  createRange(): WebRange;
  createTreeWalker(root: unknown, whatToShow: number): { nextNode(): WebTextNode | null };
};

/** `NodeFilter.SHOW_TEXT`. */
const SHOW_TEXT = 4;

/**
 * Le même contrôle sur le web (appli web de démonstration et des recettes) : le navigateur coupe un mot trop long
 * (`word-wrap: break-word`) ; un mot dont les morceaux sont sur deux lignes est coupé. `element` : le nœud du libellé.
 */
export function webLabelBreaksInsideWord(element: unknown): boolean {
  const doc = (globalThis as { document?: WebDocument }).document;
  if (!doc || !element) return false;
  const range = doc.createRange();
  const walker = doc.createTreeWalker(element, SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? "";
    for (const m of text.matchAll(/[\p{L}\p{N}]+/gu)) {
      const start = m.index ?? 0;
      range.setStart(node, start);
      range.setEnd(node, start + m[0].length);
      const tops = new Set<number>();
      const rects = range.getClientRects();
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (r && r.width > 0) tops.add(Math.round(r.top));
      }
      if (tops.size > 1) return true;
    }
  }
  return false;
}
