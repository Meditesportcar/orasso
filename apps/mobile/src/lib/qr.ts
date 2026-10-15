// Dessin d'un QR code : matrice de modules (bibliothèque `qrcode`, calcul pur, sans réseau) puis tracé SVG.
// Le QR d'inscription (141 caractères, alphanumérique) tient en version 6, correction M (41 × 41 modules).
import QRCode from "qrcode/lib/core/qrcode";

/** Zone calme autour du QR, en modules (norme : 4). */
export const QUIET_ZONE = 4;

export type QrMatrix = { size: number; version: number; dark: (x: number, y: number) => boolean };

export function qrMatrix(text: string): QrMatrix {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const { size, data } = qr.modules;
  return { size, version: qr.version, dark: (x, y) => data[y * size + x] === 1 };
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
