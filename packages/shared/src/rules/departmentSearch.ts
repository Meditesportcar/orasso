// Lot R4d (maquette R4.2, « Où chercher ? » › Ailleurs) : la recherche d'un département, commune à l'appli et au site,
// et les derniers départements choisis. Logique pure (testée) ; les noms viennent de la liste du design-system.

/** Recherche sans accents ni casse : « Hérault » → « herault » (aussi la liste « Ton coin » de l'Arrivée). */
export const foldSearch = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Les séparateurs d'un nom (espace, tiret, apostrophe) comptent pour un seul espace : « cote d'or » = « Côte-d'Or ». */
const words = (s: string) =>
  foldSearch(s)
    .split(/[\s'’-]+/)
    .filter(Boolean);

/** Les départements montrés au plus dans la liste déroulante. */
export const DEPARTMENT_MATCHES_SHOWN = 5;

/**
 * Les départements qui correspondent à un texte, les meilleurs d'abord : le début du numéro (« 34 », « 2a »), puis le
 * début du nom (« pyrenees » : Pyrénées-Atlantiques, Pyrénées-Orientales), puis le début d'un mot du nom (« her » trouve
 * Hérault, pas Cher ; Hautes-Pyrénées pour « pyrenees »). Dans chaque rang, l'ordre de la liste. Texte vide : rien.
 */
export function matchDepartments<T extends { code: string; name: string }>(list: readonly T[], query: string): T[] {
  const q = words(query);
  if (!q.length) return [];
  const joined = q.join(" ");
  const rank = (d: T): number => {
    if (q.length === 1 && d.code.toLowerCase().startsWith(q[0] as string)) return 0;
    const name = words(d.name);
    if (name.join(" ").startsWith(joined)) return 1;
    // Plusieurs mots : la suite de mots à partir de n'importe quel mot du nom (« orientales », « d or »).
    for (let i = 1; i < name.length; i += 1) if (name.slice(i).join(" ").startsWith(joined)) return 2;
    return 3;
  };
  return list
    .map((d, i) => ({ d, i, r: rank(d) }))
    .filter((x) => x.r < 3)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.d);
}

/** Les derniers départements choisis par « Ailleurs », gardés avec les choix de l'Explorer (par compte). */
export const AWAY_RECENT_MAX = 3;

/** Un choix « Ailleurs » de plus : en tête, sans doublon, 3 au plus. */
export function pushRecentDepartment(list: readonly string[], code: string, max = AWAY_RECENT_MAX): string[] {
  return [code, ...list.filter((c) => c !== code)].slice(0, max);
}

/** Lecture prudente d'une liste gardée (appareil, cookie) : des départements connus, sans doublon, 3 au plus. */
export function readRecentDepartments(raw: unknown, isDepartment: (code: string) => boolean): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string" || !isDepartment(v) || out.includes(v)) continue;
    out.push(v);
    if (out.length === AWAY_RECENT_MAX) break;
  }
  return out;
}
