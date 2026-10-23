// Dessin d'un QR code : matrice de modules (bibliothèque `qrcode`, calcul pur, sans réseau) puis tracé SVG.
// Le QR d'inscription (141 caractères, alphanumérique) tient en version 6, correction M (41 × 41 modules).
// Lot M4 (maquette 5.1) : le QR d'accès porte le O au centre. Correction d'erreur H (30 % des mots de code
// récupérables) et un carré central vide d'au plus 20 % de la surface ; `qr.test.ts` décode l'image obtenue.
import QRCode from "qrcode/lib/core/qrcode";

/** Zone calme autour du QR, en modules (norme : 4). */
export const QUIET_ZONE = 4;

export type QrLevel = "M" | "H";

export type QrMatrix = {
  size: number;
  version: number;
  dark: (x: number, y: number) => boolean;
  /** Carré central laissé vide pour le logo (en modules), ou `null`. */
  logo: { start: number; side: number } | null;
};

/** Part de la largeur du QR laissée au logo : 22 % (≈ 5 % de la surface, bien sous le plafond de 20 %). */
export const LOGO_WIDTH_RATIO = 0.22;
/** Plafond de la surface du logo (lot M4) : au-delà, le scan n'est plus garanti. */
export const LOGO_AREA_MAX = 0.2;

/** Carré central impair (centré sur un module), d'environ `LOGO_WIDTH_RATIO` de la largeur. */
export function logoBox(size: number): { start: number; side: number } {
  let side = Math.round(size * LOGO_WIDTH_RATIO);
  if (side % 2 === 0) side -= 1;
  return { start: (size - side) / 2, side };
}

export function qrMatrix(text: string, opts: { logo?: boolean } = {}): QrMatrix {
  const level: QrLevel = opts.logo ? "H" : "M";
  const qr = QRCode.create(text, { errorCorrectionLevel: level });
  const { size, data } = qr.modules;
  const logo = opts.logo ? logoBox(size) : null;
  const inLogo = (x: number, y: number) =>
    logo !== null && x >= logo.start && x < logo.start + logo.side && y >= logo.start && y < logo.start + logo.side;
  return { size, version: qr.version, logo, dark: (x, y) => !inLogo(x, y) && data[y * size + x] === 1 };
}

/**
 * Tracé SVG (un seul `<Path>`) : une barre horizontale par suite de modules sombres. Les coordonnées sont en
 * modules, la zone calme comprise : à poser dans un `viewBox` de `size + 2 × QUIET_ZONE`.
 */
export function qrPath(matrix: QrMatrix): string {
  const parts: string[] = [];
  for (let y = 0; y < matrix.size; y++) {
    let x = 0;
    while (x < matrix.size) {
      if (!matrix.dark(x, y)) {
        x++;
        continue;
      }
      const start = x;
      while (x < matrix.size && matrix.dark(x, y)) x++;
      parts.push(`M${start + QUIET_ZONE} ${y + QUIET_ZONE}h${x - start}v1h${start - x}z`);
    }
  }
  return parts.join("");
}

export const qrViewBox = (matrix: QrMatrix) => matrix.size + 2 * QUIET_ZONE;
