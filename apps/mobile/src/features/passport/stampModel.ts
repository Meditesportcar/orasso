// Dessin d'un tampon du passeport (lot 50, prototype DA v2 `stampSvg`) : la forme, le texte, l'usure. Aucune dépendance
// native : tout est calculé ici, de façon déterministe, pour que le même tampon se redessine toujours à l'identique
// (même `seed`, même tampon : sur la page, dans le récap, après un rechargement).
//   forme     : rond (rassemblement), rectangle (expo, salon, portes ouvertes), octogone (nocturne, avec sa lune),
//               tasse (cars & coffee), étoile à 24 pointes (rare) ;
//   encre     : jeton `stamp-ink-<département>` ou `stamp-ink-default` ; les rares en dorure (dégradé or) ;
//   usure     : angle −14° à +14°, pression (opacité de 70 à 100 %), bavure (copie de l'encre un peu plus large et
//               décalée), éclats de papier (points de la couleur de la page, d'autant plus nombreux que la pression est
//               faible). React Native n'a pas `feTurbulence` : pas de filtre, mêmes effets par des formes.
import {
  type PassportStamp,
  type StampInk,
  type StampShape,
  stampKindLabels,
  stampWear,
  wallTime,
} from "@orasso/shared";

/** Dorure des rares : dégradé or (écart 6 du README du système de design, couleurs du prototype). */
export const STAMP_GOLD = { from: "#b8860b", mid: "#f1d27a", to: "#9a6d06" } as const;

/** Les cinq silhouettes : les quatre formes d'événement, et l'étoile des rares. */
export type StampSilhouette = StampShape | "star";

/** Cadre de dessin : 120 × 120. */
export const STAMP_BOX = 120;

const circle = (r: number) => `M60 60m-${r} 0a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0-${2 * r} 0`;
const roundRect = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;

function star(): string {
  let d = "";
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = i % 2 ? 48 : 54;
    d += `${i ? "L" : "M"}${(60 + r * Math.cos(a)).toFixed(1)} ${(60 + r * Math.sin(a)).toFixed(1)}`;
  }
  return `${d}Z`;
}

export type StampStroke = { d: string; width: number };

export type StampShapeArt = {
  strokes: StampStroke[];
  /** Pleins (le croissant de lune de la nocturne). */
  fills: string[];
  /** Le titre court sur l'anneau (formes rondes) ; sinon sur une ligne au-dessus de la date. */
  ring: boolean;
  /** Largeur utile du titre sur une ligne (formes sans anneau). */
  titleWidth: number;
  /** Ordonnées du titre sur ligne, de la date et de l'année. */
  titleY: number;
  dateY: number;
  yearY: number;
  dateSize: number;
};

/** Contour de chaque silhouette (géométrie du prototype). */
export function stampShapeArt(silhouette: StampSilhouette): StampShapeArt {
  switch (silhouette) {
    case "rect":
      return {
        strokes: [
          { d: roundRect(12, 26, 96, 68, 6), width: 4 },
          { d: roundRect(18, 32, 84, 56, 3), width: 1.5 },
        ],
        fills: [],
        ring: false,
        titleWidth: 80,
        titleY: 46,
        dateY: 68,
        yearY: 82,
        dateSize: 24,
      };
    case "octagon":
      return {
        strokes: [
          { d: "M42 14H78L106 42V78L78 106H42L14 78V42Z", width: 4 },
          { d: "M47 22H73L98 47V73L73 98H47L22 73V47Z", width: 1.5 },
        ],
        fills: ["M78 30a12 12 0 1 0 8 20a10 10 0 1 1-8-20z"],
        ring: true,
        titleWidth: 0,
        titleY: 46,
        dateY: 66,
        yearY: 78,
        dateSize: 22,
      };
    case "cup":
      return {
        strokes: [
          { d: "M22 34H88V74A22 22 0 0 1 66 96H44A22 22 0 0 1 22 74Z", width: 4 },
          { d: "M88 46H96A10 10 0 0 1 96 66H88", width: 4 },
        ],
        fills: [],
        ring: false,
        titleWidth: 58,
        titleY: 50,
        dateY: 68,
        yearY: 82,
        dateSize: 24,
      };
    case "star":
      return {
        strokes: [
          { d: star(), width: 3.5 },
          { d: circle(38), width: 1.5 },
        ],
        fills: [],
        ring: true,
        titleWidth: 0,
        titleY: 46,
        dateY: 66,
        yearY: 78,
        dateSize: 22,
      };
    default:
      return {
        strokes: [
          { d: circle(52), width: 4 },
          { d: circle(34), width: 1.5 },
        ],
        fills: [],
        ring: true,
        titleWidth: 0,
        titleY: 46,
        dateY: 66,
        yearY: 78,
        dateSize: 22,
      };
  }
}

/** Anneau sur lequel court le titre (cercle de rayon 43 qui part de la gauche). */
export const STAMP_RING_PATH = "M60 60m-43 0a43 43 0 1 1 86 0a43 43 0 1 1-86 0";

/** Silhouette d'un tampon : l'étoile pour un rare, sinon la forme du format de l'événement. */
export function silhouetteOf(stamp: Pick<PassportStamp, "shape" | "rare">): StampSilhouette {
  return stamp.rare ? "star" : stamp.shape;
}

/** Clé de la couleur d'encre dans le thème (`stampInk66`, `stampInkDefault`). */
export type StampInkKey = "stampInk66" | "stampInk34" | "stampInk31" | "stampInk11" | "stampInkDefault";
export function inkTokenKey(ink: StampInk): StampInkKey {
  return `stampInk${ink === "default" ? "Default" : ink}` as StampInkKey;
}

/** PRNG déterministe (mulberry32) : tire les éclats et la bavure à partir de `seed`. */
function rng(seed: number): () => number {
  let a = (seed * 2654435761 + 12345) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type StampLook = {
  /** Degrés, −14 à +14. */
  angle: number;
  /** Opacité de l'encre, 0,70 à 1. */
  opacity: number;
  /** Bavure : copie de l'encre décalée de (x, y) et agrandie de `scale`, à `alpha` d'opacité. */
  bleed: { x: number; y: number; scale: number; alpha: number };
  /** Éclats de papier : points (x, y, rayon) de la couleur de la page. */
  specks: { x: number; y: number; r: number }[];
};

/** L'usure d'un tampon : toujours la même pour la même `seed` (0–9999). */
export function stampLook(seed: number): StampLook {
  const wear = stampWear(seed);
  const random = rng(seed);
  const opacity = Math.round((0.7 + ((wear.pressure - 0.62) / 0.38) * 0.3) * 100) / 100;
  const bleed = {
    x: Math.round((random() - 0.5) * 3 * 10) / 10,
    y: Math.round((random() - 0.5) * 3 * 10) / 10,
    scale: Math.round((1.03 + random() * 0.03) * 1000) / 1000,
    alpha: Math.round((0.12 + wear.smudge * 0.28) * 100) / 100,
  };
  const count = 3 + Math.round((1 - opacity) * 40);
  const specks = Array.from({ length: count }, () => ({
    x: Math.round(random() * STAMP_BOX * 10) / 10,
    y: Math.round(random() * STAMP_BOX * 10) / 10,
    r: Math.round((0.7 + random() * 1.6) * 10) / 10,
  }));
  return { angle: wear.angle, opacity, bleed, specks };
}

const upper = (s: string) => s.toLocaleUpperCase("fr-FR");

export type StampText = {
  /** Titre en capitales : l'événement, ou le nom du rare (« Première sortie »). */
  title: string;
  /** « 24.10 » */
  date: string;
  /** « 2026 », ou « RARE » pour un rare. */
  year: string;
  /** Texte de l'anneau : « NOCTURNE DE CANET · 66 · ». */
  ring: string;
  /** Titre sur une ligne (formes sans anneau) : 24 caractères au plus, un point si coupé ; le corps se réduit (`lineFontSize`). */
  short: string;
};

/** Les mots d'un tampon : le titre de l'événement, la date et le département. */
export function stampText(stamp: Pick<PassportStamp, "kind" | "rare" | "event">, timeZone?: string): StampText {
  const title = upper(stamp.rare ? stampKindLabels[stamp.kind] : stamp.event.title);
  const w = wallTime(new Date(stamp.event.startsAt), timeZone);
  const dd = String(w.day).padStart(2, "0");
  const mm = String(w.month).padStart(2, "0");
  const dept = stamp.event.department ?? "";
  return {
    title,
    date: `${dd}.${mm}`,
    year: stamp.rare ? "RARE" : String(w.year),
    ring: `${title}${dept ? ` · ${dept}` : ""} ·`,
    short: title.length > 24 ? `${title.slice(0, 24)}.` : title,
  };
}

/**
 * Emplacements des huit tampons d'une page, dans un cadre de 310 × 440 : deux colonnes décalées, quatre rangées. Chaque
 * tampon bouge un peu (±7 en x et en y) selon sa `seed`, pour que deux pages ne se ressemblent jamais.
 */
export const PAGE_BOX = { width: 310, height: 440 } as const;
const SLOT_SIZE = 108;
const SLOTS: readonly (readonly [number, number])[] = [
  [2, 4],
  [152, 22],
  [10, 108],
  [146, 128],
  [4, 212],
  [154, 232],
  [14, 316],
  [142, 330],
];

export type StampPlacement = { x: number; y: number; size: number };

export function stampPlacement(index: number, seed: number): StampPlacement {
  const [x, y] = SLOTS[index % SLOTS.length] ?? SLOTS[0] ?? [0, 0];
  const random = rng(seed + index * 31);
  return {
    x: Math.max(0, Math.round(x + (random() - 0.5) * 14)),
    y: Math.max(0, Math.round(y + (random() - 0.5) * 12)),
    size: Math.round(SLOT_SIZE + (random() - 0.5) * 12),
  };
}

/**
 * Corps du titre sur une ligne (rectangle, tasse) : réduit selon la longueur pour tenir dans la forme (8,5 au plus,
 * 4,5 au moins) ; un titre long n'est plus coupé par le bord du cadre.
 */
export function lineFontSize(title: string, width: number): number {
  return Math.round(Math.max(4.5, Math.min(8.5, width / (Math.max(1, title.length) * 0.67))) * 10) / 10;
}

/** Corps du texte de l'anneau : 9,5 jusqu'à 26 caractères, puis réduit pour que le titre tienne sur le tour (jamais en dessous de 5,5). */
export function ringFontSize(ring: string): number {
  return Math.round(Math.max(5.5, Math.min(9.5, (9.5 * 26) / Math.max(1, ring.length))) * 10) / 10;
}

/** Forme de la chute (`StampDrop` du kit : le O nu, dans un rond, dans un cadre) : le O doré pour un rare, le rond pour un rond, le cadre pour le reste. */
export function dropShapeOf(stamp: Pick<PassportStamp, "shape" | "rare">): "o" | "round" | "square" {
  if (stamp.rare) return "o";
  return stamp.shape === "round" ? "round" : "square";
}
