// Lecture des dégradés CSS des jetons (groundFx, barFx) pour les redessiner avec react-native-svg.
// Les jetons gardent la syntaxe CSS du web ; ce module la lit et calcule la géométrie SVG d'une boîte donnée.
// Formes prises en charge (celles des jetons) : radial-gradient(ellipse RX% RY% at X% Y%, arrêts…),
// linear-gradient(ANGLEdeg, arrêts…), repeating-linear-gradient(ANGLEdeg, bandes franches en px).

export type Rgba = { r: number; g: number; b: number; a: number };

export type GradientStop = {
  color: Rgba;
  /** Position : fraction de la ligne du dégradé (0 à 1), ou en px pour un dégradé répété. */
  at: number;
  unit: "%" | "px";
};

export type ParsedGradient =
  | { kind: "linear"; angle: number; stops: GradientStop[]; repeating: boolean }
  | { kind: "radial"; rx: number; ry: number; cx: number; cy: number; stops: GradientStop[] };

/** Découpe sur les virgules qui ne sont pas dans une parenthèse. */
export function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

export function parseColor(text: string): Rgba {
  const value = text.trim().toLowerCase();
  if (value === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  if (value.startsWith("#")) {
    let hex = value.slice(1);
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join("");
    const n = (i: number) => Number.parseInt(hex.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: hex.length === 8 ? n(6) / 255 : 1 };
  }
  const match = value.match(/^rgba?\(([^)]+)\)$/);
  if (match?.[1]) {
    const [r = 0, g = 0, b = 0, a = 1] = match[1].split(/[\s,/]+/).map(Number);
    return { r, g, b, a };
  }
  throw new Error(`Couleur de dégradé non reconnue : ${text}`);
}

const COLOR = /^(rgba?\([^)]*\)|#[0-9a-f]+|transparent)\s*(.*)$/i;

function parseStops(parts: string[]): GradientStop[] {
  const raw: { color: Rgba; at: number | null; unit: "%" | "px" }[] = [];
  for (const part of parts) {
    const m = part.match(COLOR);
    if (!m?.[1]) throw new Error(`Arrêt de dégradé non reconnu : ${part}`);
    const color = parseColor(m[1]);
    const positions = (m[2] ?? "").split(/\s+/).filter(Boolean);
    if (positions.length === 0) raw.push({ color, at: null, unit: "%" });
    for (const p of positions) {
      const unit = p.endsWith("px") ? "px" : "%";
      const num = Number.parseFloat(p);
      raw.push({ color, at: unit === "%" ? num / 100 : num, unit });
    }
  }
  // Arrêts sans position : le premier à 0, le dernier à 100 %, les autres répartis (règle CSS).
  const first = raw[0];
  const last = raw[raw.length - 1];
  if (first && first.at === null) first.at = 0;
  if (last && last.at === null) last.at = raw.some((s) => s.unit === "px") ? 0 : 1;
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || item.at !== null) continue;
    let j = i;
    while (raw[j]?.at === null) j++;
    const from = raw[i - 1]?.at ?? 0;
    const to = raw[j]?.at ?? 1;
    const step = (to - from) / (j - i + 1);
    for (let k = i; k < j; k++) {
      const entry = raw[k];
      if (entry) entry.at = from + step * (k - i + 1);
    }
  }
  const stops = raw.map((s) => ({ color: s.color, at: s.at ?? 0, unit: s.unit }));
  // « transparent » est du noir transparent : on lui donne la teinte du voisin, comme le fait CSS
  // (interpolation en alpha prémultiplié), pour éviter un liseré gris dans le dégradé.
  stops.forEach((stop, i) => {
    if (stop.color.a !== 0) return;
    const neighbour = stops[i - 1]?.color.a ? stops[i - 1] : stops[i + 1]?.color.a ? stops[i + 1] : undefined;
    if (neighbour) stop.color = { ...neighbour.color, a: 0 };
  });
  return stops;
}

export function parseGradient(css: string): ParsedGradient {
  const open = css.indexOf("(");
  const name = css.slice(0, open).trim();
  const parts = splitTopLevel(css.slice(open + 1, css.lastIndexOf(")")));
  const head = parts[0] ?? "";
  if (name === "radial-gradient") {
    const m = head.match(/^ellipse\s+([\d.]+)%\s+([\d.]+)%\s+at\s+(-?[\d.]+)%\s+(-?[\d.]+)%$/);
    if (!m) throw new Error(`Dégradé radial non reconnu : ${head}`);
    const [, rx, ry, cx, cy] = m.map(Number);
    return {
      kind: "radial",
      rx: (rx ?? 0) / 100,
      ry: (ry ?? 0) / 100,
      cx: (cx ?? 0) / 100,
      cy: (cy ?? 0) / 100,
      stops: parseStops(parts.slice(1)),
    };
  }
  if (name === "linear-gradient" || name === "repeating-linear-gradient") {
    const m = head.match(/^(-?[\d.]+)deg$/);
    if (!m) throw new Error(`Dégradé linéaire non reconnu : ${head}`);
    return {
      kind: "linear",
      angle: Number.parseFloat(m[1] ?? "0"),
      stops: parseStops(parts.slice(1)),
      repeating: name === "repeating-linear-gradient",
    };
  }
  throw new Error(`Dégradé non reconnu : ${css}`);
}

/** Vecteur de la ligne d'un dégradé linéaire CSS dans une boîte W × H (angle CSS : 0° vers le haut, sens horaire). */
export function linearLine(angle: number, width: number, height: number) {
  const rad = (angle * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const length = Math.abs(width * Math.sin(rad)) + Math.abs(height * Math.cos(rad));
  const cx = width / 2;
  const cy = height / 2;
  return {
    x1: cx - (dx * length) / 2,
    y1: cy - (dy * length) / 2,
    x2: cx + (dx * length) / 2,
    y2: cy + (dy * length) / 2,
    dx,
    dy,
    length,
  };
}

export type Band = { color: Rgba; points: [number, number][] };

/**
 * Bandes franches d'un dégradé répété (le marquage au sol) : un polygone par bande visible, tourné à l'angle
 * du dégradé. Seules les bandes à couleur constante sont prises en charge, ce qui est le cas des jetons.
 */
export function repeatingBands(gradient: Extract<ParsedGradient, { kind: "linear" }>, width: number, height: number) {
  const { x1, y1, dx, dy, length } = linearLine(gradient.angle, width, height);
  const stops = gradient.stops;
  const period = stops[stops.length - 1]?.at ?? 0;
  const bands: Band[] = [];
  if (period <= 0) return bands;
  const reach = width + height;
  const nx = -dy;
  const ny = dx;
  for (let start = 0; start < length; start += period) {
    for (let i = 0; i + 1 < stops.length; i++) {
      const a = stops[i];
      const b = stops[i + 1];
      if (!a || !b || b.at <= a.at || a.color.a === 0) continue;
      const t0 = start + a.at;
      const t1 = start + b.at;
      const p = (t: number, side: number): [number, number] => [
        x1 + dx * t + nx * reach * side,
        y1 + dy * t + ny * reach * side,
      ];
      bands.push({ color: a.color, points: [p(t0, 1), p(t1, 1), p(t1, -1), p(t0, -1)] });
    }
  }
  return bands;
}

export const rgbOf = (c: Rgba) => `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})`;
