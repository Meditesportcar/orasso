// Analyseur unique des plaques lues par ML Kit (lots 48 et 51, unifiés à la relecture du lot 48). SIV « AA-123-AA »,
// FNI « 1234 AB 12 » (Corse « 2A » / « 2B », outre-mer sur 3 chiffres), et depuis le lot M2 W garage « W-623-AX »,
// WW provisoire « WW-123-AB » et diplomatiques « 12 CD 345 » ; séparateurs espace ou tiret facultatifs.
// Chaque caractère est relu selon sa place (lettre ou chiffre) :
// - lecture **stricte** (accueil drive, lot 48) : seules les confusions O/0, I/1, B/8 sont relues, et une SIV ne
//   contient ni I, ni O, ni U ; chaque découpage possible donne une variante, la liste du téléphone tranche (hachage) ;
// - lecture **large** (floutage, lot 51, `detect.ts`) : toutes les confusions courantes (Q, D, L, Z, S, G, T…) :
//   proposer un cadre de trop ne coûte rien, la personne confirme.
// Pur, sans réseau : testé par Vitest (`recognize.test.ts`, `detect.test.ts`).

export type Tolerance = "strict" | "wide";

const CONFUSIONS: Record<Tolerance, { digit: Record<string, string>; letter: Record<string, string> }> = {
  strict: { digit: { O: "0", I: "1", B: "8" }, letter: { "0": "O", "1": "I", "8": "B" } },
  wide: {
    digit: { O: "0", Q: "0", D: "0", I: "1", L: "1", Z: "2", S: "5", G: "6", B: "8", T: "7" },
    letter: { "0": "O", "1": "I", "2": "Z", "5": "S", "6": "G", "8": "B", "7": "T" },
  },
};

/**
 * Formes : L lettre, D chiffre, C département corse (« A » ou « B » après le « 2 ») ; une minuscule est une lettre
 * imposée (« w » : le W des plaques garage, « c », « d », « m », « k » : les plaques diplomatiques).
 */
const SIV = "LLDDDLL";
const FNI: string[] = [];
for (let d = 1; d <= 4; d++) {
  for (let l = 1; l <= 3; l++) {
    for (const dept of ["DD", "DDD", "DC"]) FNI.push(`${"D".repeat(d)}${"L".repeat(l)}${dept}`);
  }
}
/** Lot M2 : W garage (W-623-AX) et WW provisoire (WW-123-AB), lus comme une SIV. */
const W_SHAPES = ["wDDDLL", "wwDDDLL"];
/** Lot M2 : diplomatiques, code du pays (1 à 3 chiffres), CD / CMD / C / K, numéro (1 à 4 chiffres). */
const DIPLOMATIC: string[] = [];
for (let a = 1; a <= 3; a++) {
  for (const mark of ["cd", "cmd", "c", "k"]) {
    for (let b = 1; b <= 4; b++) DIPLOMATIC.push(`${"D".repeat(a)}${mark}${"D".repeat(b)}`);
  }
}

/** Majuscules, lettres et chiffres seulement (« ga-662 ks » → « GA662KS »). */
export const normalizePlateText = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

/** Relit `s` selon la forme ; `null` si un caractère ne peut pas tenir sa place. */
function read(s: string, shape: string, tolerance: Tolerance): string | null {
  if (s.length !== shape.length) return null;
  const { digit, letter } = CONFUSIONS[tolerance];
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i] as string;
    const cls = shape[i] as string;
    if (cls !== cls.toUpperCase()) {
      const want = cls.toUpperCase();
      if (ch === want || letter[ch] === want) out += want;
      else return null;
    } else if (cls === "D") {
      if (/[0-9]/.test(ch)) out += ch;
      else if (digit[ch]) out += digit[ch];
      else return null;
    } else if (cls === "C") {
      const v = letter[ch] ?? ch;
      if (v !== "A" && v !== "B") return null;
      out += v;
    } else if (/[A-Z]/.test(ch)) out += ch;
    else if (letter[ch]) out += letter[ch];
    else return null;
  }
  return out;
}

/** Une plaque lue doit contenir au moins un vrai chiffre et une vraie lettre (pas « OOOOOOO » ni « 8888888 »). */
const mixed = (raw: string) => /[0-9]/.test(raw) && /[A-Z]/.test(raw);

/** SIV : ni I, ni O, ni U ; ni « SS » à gauche, ni « WW » ; jamais « 000 ». */
function validSiv(p: string): boolean {
  return !/[IOU]/.test(p) && p.slice(0, 2) !== "SS" && p.slice(0, 2) !== "WW" && p.slice(2, 5) !== "000";
}

/** FNI : numéro de 1 à 9999 (jamais que des zéros). */
const validFni = (p: string) => !/^0+[A-Z]/.test(p);

/** Nombre de caractères relus (O → 0, 8 → B…) : la variante la plus fidèle à la lecture passe devant. */
function fixes(raw: string, plate: string): number {
  let n = 0;
  for (let i = 0; i < raw.length; i++) if (raw[i] !== plate[i]) n++;
  return n;
}

/** `siv` : forme d'une plaque récente (SIV, W garage, WW), classée devant les autres. */
export type PlateReading = { plate: string; siv: boolean; fixes: number };

/** Les lectures possibles d'un groupe de caractères déjà normalisé (sans séparateur). */
export function plateReadings(raw: string, tolerance: Tolerance = "strict"): PlateReading[] {
  if (raw.length < 5 || raw.length > 10 || !mixed(raw)) return [];
  const strict = tolerance === "strict";
  const out: PlateReading[] = [];
  const siv = read(raw, SIV, tolerance);
  if (siv && (!strict || validSiv(siv))) out.push({ plate: siv, siv: true, fixes: fixes(raw, siv) });
  for (const shape of W_SHAPES) {
    const w = read(raw, shape, tolerance);
    if (w && !out.some((c) => c.plate === w)) out.push({ plate: w, siv: true, fixes: fixes(raw, w) });
  }
  for (const shape of DIPLOMATIC) {
    const dip = read(raw, shape, tolerance);
    if (dip && !out.some((c) => c.plate === dip)) out.push({ plate: dip, siv: false, fixes: fixes(raw, dip) });
  }
  for (const shape of FNI) {
    const fni = read(raw, shape, tolerance);
    if (fni && (!strict || validFni(fni)) && !out.some((c) => c.plate === fni)) {
      out.push({ plate: fni, siv: false, fixes: fixes(raw, fni) });
    }
  }
  return out;
}

/** Les mots d'une ligne lue (séparés par espace, tiret, point), normalisés. */
const wordsOf = (line: string) =>
  line
    .split(/[\s\-–.·]+/)
    .map(normalizePlateText)
    .filter(Boolean);

type Candidate = PlateReading & { order: number };

/** Plaques candidates d'une seule ligne : chaque suite de 1 à 3 mots voisins est essayée comme une plaque. */
function platesOfLine(line: string): PlateReading[] {
  const found = new Map<string, Candidate>();
  const words = wordsOf(line);
  for (let i = 0; i < words.length; i++) {
    let raw = "";
    for (let j = i; j < Math.min(words.length, i + 3); j++) {
      raw += words[j];
      for (const c of plateReadings(raw)) {
        const known = found.get(c.plate);
        if (!known) found.set(c.plate, { ...c, order: found.size });
        else if (c.fixes < known.fixes) known.fixes = c.fixes;
      }
    }
  }
  return [...found.values()].sort((a, b) => Number(b.siv) - Number(a.siv) || a.fixes - b.fixes || a.order - b.order);
}

/**
 * Plaques candidates d'un texte (une ou plusieurs lignes ; une plaque ne s'étend jamais sur deux lignes). SIV d'abord
 * (le format de toutes les voitures immatriculées depuis 2009), puis la variante la moins relue, puis l'ordre de
 * lecture ; sans doublon.
 */
export function extractPlates(text: string): string[] {
  const out: string[] = [];
  const all = text.split(/\r?\n/).flatMap(platesOfLine);
  all.sort((a, b) => Number(b.siv) - Number(a.siv) || a.fixes - b.fixes);
  for (const c of all) if (!out.includes(c.plate)) out.push(c.plate);
  return out;
}

/** Cadre d'une ligne lue par ML Kit, en pixels de la photo. */
export type LineFrame = { left: number; top: number; width: number; height: number };

/** Une plaque repérée sur une photo : ses variantes et la place de sa ligne (proximité de la voiture). */
export type PlateGroup = { plates: string[]; frame?: LineFrame };

/**
 * Plaques d'une photo, une par ligne lue, de la plus proche à la plus lointaine (accueil drive, relecture du lot 48) :
 * la plaque la plus haute à l'image (cadre le plus grand) est celle de la voiture de devant ; à hauteur égale, la plus
 * basse dans l'image. Une ligne sans cadre (saisie au clavier) garde son rang.
 */
export function plateGroups(lines: readonly { text: string; frame?: LineFrame }[]): PlateGroup[] {
  const groups: (PlateGroup & { i: number })[] = [];
  lines.forEach((line, i) => {
    const plates = platesOfLine(line.text).map((c) => c.plate);
    if (plates.length) groups.push({ plates, frame: line.frame, i });
  });
  const height = (g: PlateGroup) => g.frame?.height ?? 0;
  const bottom = (g: PlateGroup) => (g.frame ? g.frame.top + g.frame.height : 0);
  groups.sort((a, b) => height(b) - height(a) || bottom(b) - bottom(a) || a.i - b.i);
  return groups.map(({ plates, frame }) => ({ plates, frame }));
}
