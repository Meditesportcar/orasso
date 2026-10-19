// Menu de la vitrine d'un prestataire (lot 46, `s-vitrine` : « Menu · une ligne par plat, avec son prix »). Règle
// pure, commune à l'API (qui enregistre le menu analysé), au site et à l'appli (aperçu pendant la saisie).
import { PROVIDER_MENU_LABEL_MAX, PROVIDER_MENU_MAX_LINES } from "../provider";

export type MenuItem = { label: string; priceCents: number };
export type MenuLineError = { line: number; text: string; message: string };

/** Prix au plus 999,99 €. */
const MAX_PRICE_CENTS = 99_999;

/**
 * « Bocata de botifarra · 9 € », « Frites 4€ », « Crema catalana : 4,50 € », « Brochettes - 11 euros » : un libellé,
 * un séparateur facultatif (· : - – — ou espaces), un prix en euros (virgule ou point, deux décimales au plus) et le
 * symbole € (ou « eur », « euro(s) ») obligatoire : sans lui, « Pack 2 » serait lu comme un prix.
 */
const LINE = /^(.*?)(?:^|[\s·:\-–—]+)(\d+)(?:[,.](\d{1,2}))?\s*(?:€|eur|euros?)\s*$/i;
const TRAILING_SEPARATORS = /[\s·:\-–—]+$/;

/**
 * Lit le texte du menu, une ligne par plat. Les lignes vides sont ignorées ; chaque ligne illisible donne une erreur
 * avec son numéro (à partir de 1, lignes vides comprises : celui que voit la personne).
 */
export function parseMenuLines(text: string): { items: MenuItem[]; errors: MenuLineError[] } {
  const items: MenuItem[] = [];
  const errors: MenuLineError[] = [];
  const lines = text.split(/\r?\n/);
  for (const [i, raw] of lines.entries()) {
    const line = raw.trim();
    if (!line) continue;
    const n = i + 1;
    const m = LINE.exec(line);
    if (!m) {
      errors.push({
        line: n,
        text: line,
        message: `Ligne ${n} : indique le prix, par exemple « Frites maison · 4 € ».`,
      });
      continue;
    }
    const label = (m[1] ?? "").replace(TRAILING_SEPARATORS, "").trim();
    const priceCents = Number(m[2]) * 100 + (m[3] ? Number(m[3].padEnd(2, "0")) : 0);
    if (!label) {
      errors.push({ line: n, text: line, message: `Ligne ${n} : indique le nom du plat avant son prix.` });
    } else if (label.length > PROVIDER_MENU_LABEL_MAX) {
      errors.push({
        line: n,
        text: line,
        message: `Ligne ${n} : nom trop long (${PROVIDER_MENU_LABEL_MAX} caractères au plus).`,
      });
    } else if (priceCents > MAX_PRICE_CENTS) {
      errors.push({ line: n, text: line, message: `Ligne ${n} : prix trop élevé.` });
    } else {
      items.push({ label, priceCents });
    }
  }
  if (items.length + errors.length > PROVIDER_MENU_MAX_LINES) {
    errors.push({ line: 0, text: "", message: `${PROVIDER_MENU_MAX_LINES} plats au plus.` });
  }
  return { items, errors };
}

/** « 9 € », « 9,50 € » (espace insécable avant le symbole). */
export function formatMenuPrice(priceCents: number): string {
  const euros = Math.floor(priceCents / 100);
  const cents = priceCents % 100;
  return `${euros}${cents ? `,${String(cents).padStart(2, "0")}` : ""} €`;
}

/** Une ligne du menu telle qu'on la réécrit dans le champ de saisie : « Bocata de botifarra · 9 € ». */
export function formatMenuLine(item: MenuItem): string {
  return `${item.label} · ${formatMenuPrice(item.priceCents)}`;
}

/** Le texte à remettre dans le champ « Menu » pour le modifier (aller-retour sans perte avec `parseMenuLines`). */
export function menuToText(items: readonly MenuItem[]): string {
  return items.map(formatMenuLine).join("\n");
}

/** Prix le plus bas et le plus haut (« De 4 à 11 € »), `null` pour un menu vide. */
export function menuPriceRange(items: readonly MenuItem[]): { min: number; max: number } | null {
  if (!items.length) return null;
  const prices = items.map((i) => i.priceCents);
  return { min: Math.min(...prices), max: Math.max(...prices) };
}
