// Générateur d'affiche d'événement (lot 47, ARCHITECTURE-DA-V2 § 5.3) : une photo, un style parmi huit, un titre →
// affiche Post 4:5 et Story 9:16 rendues par l'API (une seule source pour le site, l'appli, les cartes et Instagram).
// Ici, les règles pures : styles, formats, coupe du titre (jamais tronqué), date de la souche.
import { BUSINESS_TIMEZONE } from "../enums";
import { displayNow, yearToShow } from "./dateYear";
import { wallTime } from "./time";

/**
 * Les huit modèles du prototype DA v2 (`TPLS` de `s-create`, dans son ordre) : Néon, Suisse, Rétro, JDM, Billet,
 * Magazine, Minimal, Damier. Le « flyer » du prototype n'est pas un modèle : c'est l'exemple d'affiche perso
 * (« Tu as déjà ton affiche ? »), écrit à la main ; il reste l'affiche perso (`poster_key`).
 */
export const posterStyles = ["neon", "swiss", "retro", "jdm", "ticket", "mag", "minimal", "damier"] as const;
export type PosterStyle = (typeof posterStyles)[number];

/** Style par défaut, et celui d'une affiche sans photo. */
export const POSTER_DEFAULT_STYLE: PosterStyle = "minimal";

/** Dimensions rendues (px) : Post 4:5 (vignette des cartes, publication Instagram) et Story 9:16. */
export const posterFormats = { post: [1080, 1350], story: [1080, 1920] } as const;
export type PosterFormat = keyof typeof posterFormats;

/** Titre sur l'affiche : 34 caractères au plus (« Titre sur l'affiche (34 caractères max) »). */
export const POSTER_TITLE_MAX = 34;
/** Aperçu en direct : largeur maximale demandée (px). */
export const POSTER_PREVIEW_MAX_WIDTH = 540;

/** Dimensions d'un format à une largeur donnée (aperçu), proportions gardées. */
export function posterSize(format: PosterFormat, width: number = posterFormats[format][0]) {
  const [w, h] = posterFormats[format];
  return { width: Math.round(width), height: Math.round((width * h) / w) };
}

/**
 * Largeur moyenne d'une capitale, en fraction du corps, pour chaque police de l'affiche (mesures larges ; le moteur de
 * rendu réduit encore l'image du texte si la mesure réelle dépasse, sans jamais la couper).
 */
export const posterCharWidth = {
  /** Archivo Expanded Black Italic : titres. */
  expanded: 0.9,
  /** Archivo ExtraBold : titre du style Suisse. */
  bold: 0.7,
  /** Archivo Narrow Bold : titre du style Magazine, chiffres, libellés. */
  narrow: 0.54,
  /** Archivo 62 % Black : chiffres de l'affiche à partager (lot M6). */
  condensed: 0.46,
  /** Archivo 75 % ExtraBold : étiquettes de l'affiche à partager (lot M6). */
  label: 0.58,
} as const;

export type FittedTitle = {
  /** Une ou deux lignes en capitales ; leur jonction par une espace redonne le titre entier (jamais tronqué). */
  lines: string[];
  fontSize: number;
  /** Hauteur de la boîte du titre : lignes × corps × interligne. */
  height: number;
};

const SPACES = /\s+/g;

/** Coupe en deux lignes, la plus longue la plus courte possible, jamais au milieu d'un mot. */
function balanced(words: string[]): string[] {
  let best = [words.join(" ")];
  let bestMax = Number.POSITIVE_INFINITY;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    const longest = Math.max(a.length, b.length);
    if (longest < bestMax) {
      bestMax = longest;
      best = [a, b];
    }
  }
  return best;
}

/**
 * Taille et coupe du titre dans une boîte de `maxWidth` px : une ligne au corps maximal si elle tient, sinon deux
 * lignes équilibrées ; le corps baisse jusqu'à ce que la plus longue ligne tienne. Jamais tronqué : un mot très long
 * fait baisser le corps autant qu'il faut.
 */
export function fitTitle(
  title: string,
  maxWidth: number,
  opts: { maxSize?: number; charWidth?: number; lineHeight?: number; minSize?: number } = {},
): FittedTitle {
  const text = title.replace(SPACES, " ").trim().toUpperCase() || " ";
  const maxSize = opts.maxSize ?? maxWidth / 6;
  const cw = opts.charWidth ?? posterCharWidth.expanded;
  const lh = opts.lineHeight ?? 0.9;
  const minSize = opts.minSize ?? 6;
  const sizeFor = (line: string) => maxWidth / (Math.max(1, line.length) * cw);
  const one = Math.min(maxSize, sizeFor(text));
  const words = text.split(" ");
  let lines = [text];
  let size = one;
  if (one < maxSize && words.length > 1) {
    const two = balanced(words);
    const twoSize = Math.min(maxSize, ...two.map(sizeFor));
    // Deux lignes seulement si le corps y gagne nettement (au moins 15 %).
    if (twoSize > one * 1.15) {
      lines = two;
      size = twoSize;
    }
  }
  const fontSize = Math.max(minSize, Math.floor(size));
  return { lines, fontSize, height: Math.ceil(lines.length * fontSize * lh) };
}

const DAYS = ["DIM", "LUN", "MAR", "MER", "JEU", "VEN", "SAM"];
const MONTHS = ["JANV", "FÉVR", "MARS", "AVR", "MAI", "JUIN", "JUIL", "AOÛT", "SEPT", "OCT", "NOV", "DÉC"];

export type PosterDate = {
  /** « SAM » */
  weekday: string;
  /** « 24 » */
  day: string;
  /** « OCT » */
  month: string;
  /** « 10 » */
  monthNumber: string;
  /** « 19 h », « 18 h 30 » */
  hour: string;
  /** Lot R3b : « 2027 » hors de l'année en cours, sinon vide. */
  year: string;
};

/** Souche date de l'affiche : jour de la semaine, numéro, mois, heure de début (dans le fuseau de l'événement). */
export function posterDate(startsAt: Date, timeZone = BUSINESS_TIMEZONE, now: Date = displayNow()): PosterDate {
  const w = wallTime(startsAt, timeZone);
  const weekday = new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay();
  return {
    weekday: DAYS[weekday] ?? "",
    day: String(w.day),
    month: MONTHS[w.month - 1] ?? "",
    monthNumber: String(w.month).padStart(2, "0"),
    hour: w.minute === 0 ? `${w.hour} h` : `${w.hour} h ${String(w.minute).padStart(2, "0")}`,
    year: String(yearToShow(startsAt, now, timeZone) ?? ""),
  };
}

/**
 * Aperçus d'affiche déjà rendus (assistant, lot 53) : `POST /posters/preview` est limité (60 rendus par minute) ; le
 * rail des huit styles et l'aperçu ne redemandent pas un rendu déjà fait avec les mêmes réglages (bascule Post / Story,
 * retour sur le temps). Les plus anciens sortent au-delà de `max` (`drop` libère leur adresse locale).
 */
export function createPreviewCache<T>(max = 64, drop?: (value: T) => void) {
  const entries = new Map<string, T>();
  return {
    get(key: string): T | undefined {
      const value = entries.get(key);
      if (value === undefined) return undefined;
      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    set(key: string, value: T) {
      entries.delete(key);
      entries.set(key, value);
      while (entries.size > max) {
        const [oldest, old] = entries.entries().next().value as [string, T];
        entries.delete(oldest);
        drop?.(old);
      }
    },
    get size() {
      return entries.size;
    },
  };
}

/**
 * Clé d'un aperçu : tous les réglages qui changent le rendu. Lot R3b, tour 2 : plus l'année en cours (heure d'Orasso),
 * qui décide si l'affiche écrit l'année : un Nouvel An, réel ou simulé, refait l'aperçu.
 */
export const posterPreviewKey = (input: Record<string, unknown>, now: Date = displayNow()) =>
  JSON.stringify([
    ...Object.keys(input)
      .sort()
      .map((k) => [k, input[k]]),
    ["@year", wallTime(now).year],
  ]);
