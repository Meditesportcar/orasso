// Choix de la famille Archivo statique selon la largeur, la graisse et le style (pur, sans React Native).
// Les fichiers sont dans fonts/ (scripts/generate-native-fonts.py) et chargés par fonts.ts.

/** Les trois largeurs du système : large (125 %), normale (100 %), étroite (78,4 %). */
export type FontWidth = "wide" | "normal" | "narrow";

export const archivoFamilies = [
  "Archivo-Expanded-Black",
  "Archivo-Expanded-BlackItalic",
  "Archivo-Narrow-Bold",
  "Archivo-Regular",
  "Archivo-SemiBold",
  "Archivo-ExtraBold",
] as const;

export type ArchivoFamily = (typeof archivoFamilies)[number];

/** Nom de la famille à donner à `fontFamily` pour une largeur, une graisse et un style. */
export function archivoFamily(width: FontWidth, weight: number, italic: boolean): ArchivoFamily {
  if (width === "wide") return italic ? "Archivo-Expanded-BlackItalic" : "Archivo-Expanded-Black";
  if (width === "narrow") return "Archivo-Narrow-Bold";
  if (weight >= 800) return "Archivo-ExtraBold";
  if (weight >= 600) return "Archivo-SemiBold";
  return "Archivo-Regular";
}
