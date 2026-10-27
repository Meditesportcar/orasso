// Lot R6-police (« 7 / h », « LE JOUR / J » sur le Pixel de Damien, police système agrandie) : un nombre et son unité
// ne se séparent jamais en fin de ligne (« 7 h », « 24 h », « 4,8 km », « 1 h 42 »), ni « jour J ». Une seule règle
// pour le site et l'appli : l'espace devient insécable (U+00A0, même chasse que l'espace : rien ne bouge tant que la
// ligne ne se coupe pas là).

/** L'espace insécable. */
export const NBSP = "\u00a0";

/** Unités courtes d'Orasso, après un nombre. */
const UNIT = /(\d)[ \u00a0](h|min|s|j|km|m|ch|kg|pts?|%|€)(?![\p{L}\p{N}])/gu;
/** Les minutes d'une heure (« 19 h 15 ») restent avec elle. */
const MINUTES = /(\d\u00a0h) (\d{2})(?!\d)/gu;
const DAY_J = /\b(jour) (J)\b/giu;

/** Le texte, avec une espace insécable entre chaque nombre et son unité, et dans « jour J ». */
export function keepUnits(text: string): string {
  return text.replace(UNIT, `$1${NBSP}$2`).replace(MINUTES, `$1${NBSP}$2`).replace(DAY_J, `$1${NBSP}$2`);
}
