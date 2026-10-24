// Titre ajusté sur une ou plusieurs lignes, coupé par l'appli et non par le système (lot R3a, retour 2 de Damien du
// 24/10 : « AJOUTER DES… », le mot PHOTOS manquait sur son Android). Pur : testé sans React Native.
//
// Cause probable (tour 2) : l'échelle de police ou la taille d'affichage du système, plus grandes que sur le Xiaomi de
// test, font passer le titre sur deux lignes et la seconde n'est pas affichée. `FitTitle` mesure chaque mot tel qu'il
// s'affiche, choisit lui-même les coupures de ligne et réduit le corps pour que chaque ligne tienne ; chaque ligne est un
// texte d'une ligne. Les largeurs mesurées suivent l'échelle de police du système (1,0, 1,3, 2,0…).

/** On réduit d'abord jusqu'à 70 % sur `maxLines` lignes ; au-delà, une ligne de plus plutôt qu'un corps illisible. */
export const FIT_TITLE_MIN_SCALE = 0.7;
/**
 * Marge de sécurité, proportionnelle à la place (tour 2) : la chasse ne suit pas exactement le corps (approche fixe,
 * arrondis, rendu d'Android) ; chaque ligne étant d'une ligne, un dépassement afficherait « … ». 3 %, 2 px au moins.
 */
export const FIT_TITLE_SAFETY = 0.03;

export type FitTitleInput = {
  /** Largeur de chaque mot au corps de base. */
  words: readonly number[];
  /** Largeur d'une espace au corps de base. */
  space: number;
  /** Largeur disponible. */
  room: number;
  /** Corps de base. */
  size: number;
  /** Lignes visées (2 par défaut). */
  maxLines?: number;
};

export type FitTitle = {
  fontSize: number;
  /** Les mots de chaque ligne (indices). */
  lines: number[][];
};

/** Coupures gloutonnes à l'échelle `k` ; `null` si un mot seul ne tient pas. */
function wrap(words: readonly number[], space: number, room: number, k: number): number[][] | null {
  const lines: number[][] = [];
  let width = 0;
  for (let i = 0; i < words.length; i++) {
    const w = (words[i] ?? 0) * k;
    if (w > room) return null;
    const last = lines.at(-1);
    if (last && width + space * k + w <= room) {
      last.push(i);
      width += space * k + w;
    } else {
      lines.push([i]);
      width = w;
    }
  }
  return lines;
}

/**
 * Le corps et les lignes d'un titre : le plus grand corps (au plus `size`) qui tient en `maxLines` lignes, jusqu'à 70 % ;
 * sinon, à 70 % (ou moins si un mot seul est plus large que la place), autant de lignes qu'il faut. Un titre ne se coupe
 * jamais. Mesures inconnues (0) : le corps de base, une seule ligne de tous les mots.
 */
export function fitTitle(input: FitTitleInput): FitTitle {
  const { words, space, size } = input;
  const maxLines = Math.max(1, input.maxLines ?? 2);
  const room = input.room - Math.max(2, input.room * FIT_TITLE_SAFETY);
  const all = words.map((_, i) => i);
  if (!words.length || !(input.room > 0) || words.some((w) => !(w > 0))) return { fontSize: size, lines: [all] };
  const round = (k: number) => Math.floor(size * k * 10) / 10;
  // Les échelles candidates : 1, puis celles où une ligne possible tient tout juste (de la plus grande à la plus petite).
  const candidates = new Set<number>([1]);
  for (let a = 0; a < words.length; a++) {
    let natural = 0;
    for (let b = a; b < words.length; b++) {
      natural += (words[b] ?? 0) + (b > a ? space : 0);
      const k = room / natural;
      if (k < 1 && k >= FIT_TITLE_MIN_SCALE) candidates.add(k);
    }
  }
  for (const k of [...candidates].sort((x, y) => y - x)) {
    // Arrondi vers le bas : le corps affiché ne dépasse jamais l'échelle calculée.
    const scale = round(k) / size;
    const lines = wrap(words, space, room, scale);
    if (lines && lines.length <= maxLines) return { fontSize: round(k), lines };
  }
  // Plus de `maxLines` lignes à 70 % : une ligne de plus, et un mot trop large réduit encore le corps.
  const widest = Math.max(...words);
  const k = Math.min(FIT_TITLE_MIN_SCALE, room / widest);
  const fontSize = round(k);
  return { fontSize, lines: wrap(words, space, room, fontSize / size) ?? [all] };
}

/** Les mots d'un titre, séparés par les espaces (les espaces insécables restent dans le mot). */
export const titleWords = (title: string): string[] => title.split(/ +/).filter(Boolean);
