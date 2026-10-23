// Numéro de plaque (lot M2, retours de Damien du 22/10, entrées 11 et 12) : une seule forme stockée pour la recherche
// et les doublons (`normalizePlate` → « AE665GH », colonne `plate_normalized`), une forme lisible pour l'affichage
// (« AE-665-GH »), et la reconnaissance des formats français. Une plaque étrangère ou exotique reste acceptée : elle
// n'a pas de format reconnu, l'appli affiche un simple avertissement, jamais un blocage.
/** Formats français reconnus. */
export type PlateKind = "siv" | "ww" | "wGarage" | "fni" | "diplomatic";

// SIV (depuis 2009) : AA-123-AA, ni I, ni O, ni U ; ni « SS » ni « WW » à gauche (le « WW » est le provisoire) ; jamais
// « 000 ». Les lettres des plaques W garage et WW sont celles du SIV, tolérées larges (lecture humaine).
const SIV = /^(?!SS|WW)([A-HJ-NP-TV-Z]{2})(?!000)(\d{3})([A-HJ-NP-TV-Z]{2})$/;
// WW provisoire : WW-123-AA. W garage (professionnels de l'automobile) : W-123-AA.
const WW = /^(WW)(\d{3})([A-Z]{2})$/;
const W_GARAGE = /^(W)(\d{3})([A-Z]{2})$/;
// FNI (avant 2009, encore en circulation) : 1 à 4 chiffres, 1 à 3 lettres, département (2 chiffres, 3 en outre-mer,
// « 2A » / « 2B » en Corse). Jamais un numéro de zéros.
const FNI = /^(?!0+[A-Z])(\d{1,4})([A-Z]{1,3})(\d{2,3}|2[AB])$/;
// Diplomatiques (plaques vertes) : code du pays, CD / CMD / C / K, numéro d'ordre.
const DIPLOMATIC = /^(\d{1,3})(CMD|CD|C|K)(\d{1,4})$/;

const FORMATS: { kind: PlateKind; re: RegExp; sep: string }[] = [
  { kind: "siv", re: SIV, sep: "-" },
  { kind: "ww", re: WW, sep: "-" },
  { kind: "wGarage", re: W_GARAGE, sep: "-" },
  { kind: "fni", re: FNI, sep: " " },
  { kind: "diplomatic", re: DIPLOMATIC, sep: " " },
];

/** Lettres et chiffres seuls, en majuscules, accents retirés avant (« aé-665 gh » → « AE665GH »). */
export function plateCharacters(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Département à droite d'une plaque (2 chiffres, 3 en outre-mer, « 2A » / « 2B ») : bande, pas numéro. */
const TRAILING_DEPT = /(\d{2,3}|2[AB])$/;
/** Formats récents (SIV, W garage, WW) : les seuls autour desquels une bande « F » et un département sont imprimés. */
const RECENT: PlateKind[] = ["siv", "ww", "wGarage"];

/**
 * Forme unique d'une plaque, stockée dans `plate_normalized` (recherche, doublons, accueil drive) : lettres et
 * chiffres seuls, sans accents. Lot M2, tour 2 : la bande européenne « F » à gauche et le département à droite sont
 * retirés quand le reste est une plaque récente (« F AB-123-CD 66 » → « AB123CD », « F W 623 AX 66 » → « W623AX »), le
 * « F » seul devant une FNI (« F 1234 AB 66 » → « 1234AB66 ») ;
 * une saisie déjà au format français reste telle quelle (« 1234 AB 66 » est une FNI).
 */
export function normalizePlate(raw: string): string {
  const n = plateCharacters(raw);
  if (match(n)) return n;
  const noF = n.startsWith("F") ? n.slice(1) : null;
  const strip = (s: string | null) => (s && TRAILING_DEPT.test(s) ? s.replace(TRAILING_DEPT, "") : null);
  // Le plus de bandes retirées d'abord : une plaque imprimée a la bande et le département.
  for (const c of [strip(noF), noF, strip(n)]) {
    const m = c ? match(c) : null;
    // Sans le « F », une FNI reste une FNI (son département fait partie du numéro).
    if (c && m && (RECENT.includes(m.kind) || c === noF)) return c;
  }
  return n;
}

function match(normalized: string) {
  for (const f of FORMATS) {
    const m = f.re.exec(normalized);
    if (m) return { kind: f.kind, parts: m.slice(1), sep: f.sep };
  }
  return null;
}

/** Format français du numéro (saisi ou lu, séparateurs quelconques), ou `null` (plaque étrangère, exotique, faute). */
export function plateKind(raw: string): PlateKind | null {
  return match(normalizePlate(raw))?.kind ?? null;
}

/**
 * Forme lisible : « AE-665-GH », « W-623-AX », « WW-123-AB », « 1234 AB 66 », « 12 CD 345 ». Un numéro sans format
 * français garde la saisie, en majuscules et espaces simples (« B AB 1234 » reste lisible). Vide → chaîne vide.
 */
export function formatPlate(raw: string): string {
  const m = match(normalizePlate(raw));
  if (m) return m.parts.join(m.sep);
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 -]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
