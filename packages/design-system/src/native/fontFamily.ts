// Choix de la famille Archivo statique selon la largeur, la graisse et le style (pur, sans React Native).
// Les fichiers sont dans fonts/ (scripts/generate-native-fonts.py) et chargés par fonts.ts.
// Lot C1 (D33) : l'artefact DA v2 emploie dix largeurs ; l'appli embarque celles du socle (`archivoInstances`) et
// `archivoAt` rend l'instance la plus proche d'une largeur et d'une graisse de l'artefact (CSS `font-stretch`).

/** Les trois largeurs historiques : large (125 %), normale (100 %), étroite (75 %, `.t-label` de l'artefact). */
export type FontWidth = "wide" | "normal" | "narrow";

export const archivoFamilies = [
  "Archivo-Expanded-Black",
  "Archivo-Expanded-BlackItalic",
  "Archivo-Narrow-Bold",
  "Archivo-Regular",
  "Archivo-SemiBold",
  "Archivo-ExtraBold",
  "Archivo-118-Black",
  "Archivo-115-ExtraBold",
  "Archivo-115-Black",
  "Archivo-110-Black",
  "Archivo-110-Heavy",
  "Archivo-80-ExtraBold",
  "Archivo-75-Bold",
  "Archivo-75-ExtraBold",
  "Archivo-75-Black",
  "Archivo-70-Black",
  "Archivo-62-ExtraBold",
  "Archivo-62-Black",
] as const;

export type ArchivoFamily = (typeof archivoFamilies)[number];

/** Largeur (wdth), graisse (wght) et style de chaque instance embarquée. */
export const archivoInstances: Record<ArchivoFamily, { stretch: number; weight: number; italic: boolean }> = {
  "Archivo-Expanded-Black": { stretch: 125, weight: 900, italic: false },
  "Archivo-Expanded-BlackItalic": { stretch: 125, weight: 900, italic: true },
  // 78,4 % : étiquettes v1, gardée pour le tampon du passeport et le générateur d'affiche de l'API.
  "Archivo-Narrow-Bold": { stretch: 78.4, weight: 700, italic: false },
  "Archivo-Regular": { stretch: 100, weight: 400, italic: false },
  "Archivo-SemiBold": { stretch: 100, weight: 600, italic: false },
  "Archivo-ExtraBold": { stretch: 100, weight: 800, italic: false },
  "Archivo-118-Black": { stretch: 118, weight: 900, italic: false },
  "Archivo-115-ExtraBold": { stretch: 115, weight: 800, italic: false },
  "Archivo-115-Black": { stretch: 115, weight: 900, italic: false },
  "Archivo-110-Black": { stretch: 110, weight: 900, italic: false },
  "Archivo-110-Heavy": { stretch: 110, weight: 850, italic: false },
  "Archivo-80-ExtraBold": { stretch: 80, weight: 800, italic: false },
  "Archivo-75-Bold": { stretch: 75, weight: 700, italic: false },
  "Archivo-75-ExtraBold": { stretch: 75, weight: 800, italic: false },
  "Archivo-75-Black": { stretch: 75, weight: 900, italic: false },
  "Archivo-70-Black": { stretch: 70, weight: 900, italic: false },
  "Archivo-62-ExtraBold": { stretch: 62, weight: 800, italic: false },
  "Archivo-62-Black": { stretch: 62, weight: 900, italic: false },
};

/**
 * L'instance la plus proche d'une largeur (en %) et d'une graisse de l'artefact. L'italique n'existe qu'à 125 % 900
 * (les titres) : un italique demandé ailleurs prend l'instance droite la plus proche. La largeur compte plus que la
 * graisse (un écart de 10 % de largeur se voit plus qu'un écart de 100 de graisse).
 */
export function archivoAt(stretch: number, weight: number, italic = false): ArchivoFamily {
  // Une largeur illisible (« normal », valeur absente) vaut 100 % ; une graisse illisible, 400.
  if (!Number.isFinite(stretch)) stretch = 100;
  if (!Number.isFinite(weight)) weight = 400;
  if (italic && stretch >= 112) return "Archivo-Expanded-BlackItalic";
  let best: ArchivoFamily = "Archivo-Regular";
  let score = Number.POSITIVE_INFINITY;
  for (const family of archivoFamilies) {
    const inst = archivoInstances[family];
    // L'ancienne étroite (78,4 %) ne sert plus qu'aux appelants qui la nomment.
    if (inst.italic || family === "Archivo-Narrow-Bold") continue;
    const s = Math.abs(inst.stretch - stretch) * 10 + Math.abs(inst.weight - weight);
    if (s < score) {
      score = s;
      best = family;
    }
  }
  return best;
}

/** Nom de la famille à donner à `fontFamily` pour une largeur, une graisse et un style. */
export function archivoFamily(width: FontWidth, weight: number, italic: boolean): ArchivoFamily {
  if (width === "wide") return italic ? "Archivo-Expanded-BlackItalic" : "Archivo-Expanded-Black";
  if (width === "narrow") return archivoAt(75, weight);
  if (weight >= 800) return "Archivo-ExtraBold";
  if (weight >= 600) return "Archivo-SemiBold";
  return "Archivo-Regular";
}
