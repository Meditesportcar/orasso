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

/**
 * Lot R5b, tour 2 (relecture Opus 5) : le texte à plat d'un libellé, enfants JSX compris (`<>Ajouter {nom}</>`,
 * tableaux, nombres). C'est la clé de l'ajustement : un autre texte repart du corps de base.
 */
export function flatText(node: unknown): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flatText).join("");
  if (typeof node === "object" && "props" in node) {
    return flatText((node as { props?: { children?: unknown } }).props?.children);
  }
  return "";
}

/**
 * Pixels retirés après une coupure en plein mot : un de plus, jamais sous le plancher (`null` : déjà au plancher).
 * `min` : le plancher (libellé de bouton par défaut ; lot R6-police : plus bas pour un petit libellé de compteur).
 */
export function nextCut(base: number, cut: number, min = BUTTON_LABEL_MIN): number | null {
  return base - cut - 1 >= min ? cut + 1 : null;
}

/**
 * La place du libellé a-t-elle grandi depuis la dernière coupure vue (rotation, colonne élargie, cellule de liste
 * mesurée d'abord à l'estimation) ? Le libellé remplissait alors toute sa place ; plus large maintenant, il repart du
 * corps de base. `cutWidth` : sa largeur au moment de cette coupure.
 */
export function widthGrew(cutWidth: number | null, width: number): boolean {
  return cutWidth !== null && width > cutWidth + 1;
}

type WebRect = { top: number; width: number };
type WebRange = {
  setStart(node: unknown, offset: number): void;
  setEnd(node: unknown, offset: number): void;
  selectNodeContents(node: unknown): void;
  getClientRects(): ArrayLike<WebRect>;
};

/** Nombre de lignes distinctes d'une suite de rectangles (leur haut, arrondi au pixel). */
function lineCount(rects: ArrayLike<WebRect>): number {
  const tops = new Set<number>();
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    if (r && r.width > 0) tops.add(Math.round(r.top));
  }
  return tops.size;
}
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
  // Tour 2 : un libellé sur une seule ligne (presque tous) ne peut pas être coupé ; une seule mesure, pas une par mot.
  range.selectNodeContents(element);
  if (lineCount(range.getClientRects()) < 2) return false;
  const walker = doc.createTreeWalker(element, SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? "";
    for (const m of text.matchAll(/[\p{L}\p{N}]+/gu)) {
      const start = m.index ?? 0;
      range.setStart(node, start);
      range.setEnd(node, start + m[0].length);
      if (lineCount(range.getClientRects()) > 1) return true;
    }
  }
  return false;
}
