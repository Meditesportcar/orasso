// Accueil drive (lot 48, ARCHITECTURE-DA-V2 § 3.5, prototype `s-drive`) : du texte lu par ML Kit sur une photo de la
// caméra aux plaques françaises candidates, normalisées (« GA662KS ») comme `plateNormalized`. SIV « AA-123-AA », FNI
// « 1234 AB 12 » (Corse « 2A » / « 2B »), séparateurs espace ou tiret facultatifs. Les confusions de lecture O/0, I/1,
// B/8 sont tolérées : chaque caractère est relu selon sa place (lettre ou chiffre) et chaque découpage possible donne
// une variante ; la liste du téléphone tranche (hachage salé). Pur, sans réseau : testé par Vitest.

/** Lu comme un chiffre à une place de chiffre. */
const AS_DIGIT: Record<string, string> = { O: "0", I: "1", B: "8" };
/** Lu comme une lettre à une place de lettre. */
const AS_LETTER: Record<string, string> = { "0": "O", "1": "I", "8": "B" };

type Cls = "L" | "D" | "C";

/** Formes : L lettre, D chiffre, C département corse (« A » ou « B » après le « 2 »). */
const SIV = "LLDDDLL";
const FNI: string[] = [];
for (let d = 1; d <= 4; d++) {
  for (let l = 1; l <= 3; l++) {
    for (const dept of ["DD", "DDD", "DC"]) FNI.push(`${"D".repeat(d)}${"L".repeat(l)}${dept}`);
  }
}

/** Relit `s` selon la forme ; `null` si un caractère ne peut pas tenir sa place. */
function read(s: string, shape: string): string | null {
  if (s.length !== shape.length) return null;
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i] as string;
    const cls = shape[i] as Cls;
    if (cls === "D") {
      if (/[0-9]/.test(ch)) out += ch;
      else if (AS_DIGIT[ch]) out += AS_DIGIT[ch];
      else return null;
    } else if (cls === "C") {
      const v = AS_LETTER[ch] ?? ch;
      if (v !== "A" && v !== "B") return null;
      out += v;
    } else if (/[A-Z]/.test(ch)) out += ch;
    else if (AS_LETTER[ch]) out += AS_LETTER[ch];
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

type Candidate = { plate: string; siv: boolean; fixes: number; order: number };

/** Les plaques possibles d'un groupe de caractères (sans séparateur). */
function platesOf(raw: string): { plate: string; siv: boolean; fixes: number }[] {
  if (raw.length < 5 || raw.length > 10 || !mixed(raw)) return [];
  const out: { plate: string; siv: boolean; fixes: number }[] = [];
  const siv = read(raw, SIV);
  if (siv && validSiv(siv)) out.push({ plate: siv, siv: true, fixes: fixes(raw, siv) });
  for (const shape of FNI) {
    const fni = read(raw, shape);
    if (fni && validFni(fni) && !out.some((c) => c.plate === fni)) {
      out.push({ plate: fni, siv: false, fixes: fixes(raw, fni) });
    }
  }
  return out;
}

/**
 * Plaques candidates d'un texte (une ou plusieurs lignes) : chaque suite de 1 à 3 mots voisins d'une même ligne (mots
 * séparés par un espace ou un tiret) est essayée comme une plaque. SIV d'abord (le format de toutes les voitures
 * immatriculées depuis 2009), puis la variante la moins relue, puis l'ordre de lecture ; sans doublon.
 */
export function extractPlates(text: string): string[] {
  const found = new Map<string, Candidate>();
  for (const line of text.toUpperCase().split(/\r?\n/)) {
    const words = line
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[\s\-–.·]+/)
      .map((w) => w.replace(/[^A-Z0-9]/g, ""))
      .filter(Boolean);
    for (let i = 0; i < words.length; i++) {
      let raw = "";
      for (let j = i; j < Math.min(words.length, i + 3); j++) {
        raw += words[j];
        for (const c of platesOf(raw)) {
          const known = found.get(c.plate);
          if (!known) found.set(c.plate, { ...c, order: found.size });
          else if (c.fixes < known.fixes) known.fixes = c.fixes;
        }
      }
    }
  }
  return [...found.values()]
    .sort((a, b) => Number(b.siv) - Number(a.siv) || a.fixes - b.fixes || a.order - b.order)
    .map((c) => c.plate);
}
