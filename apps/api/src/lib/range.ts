// En-tête HTTP `Range` d'une lecture de vidéo (lot R7g) : un seul intervalle d'octets, comme le demandent les lecteurs vidéo
// (Chrome, Safari, ExoPlayer d'Android, AVPlayer d'iOS). RFC 9110 § 14.
export type ByteRange = { start: number; end: number };

/**
 * `null` : pas d'intervalle à servir (en-tête absent, d'une autre unité, mal formé ou à plusieurs intervalles : on rend tout
 * le fichier, ce que la norme permet). `"unsatisfiable"` : l'intervalle est hors du fichier (416). Sinon bornes **comprises**,
 * `end` ramené à la fin du fichier.
 */
export function parseByteRange(header: string | undefined | null, size: number): ByteRange | "unsatisfiable" | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, a = "", b = ""] = m;
  if (a === "" && b === "") return null;
  if (size <= 0) return "unsatisfiable";
  if (a === "") {
    // Les `n` derniers octets.
    const n = Number(b);
    if (!Number.isSafeInteger(n) || n <= 0) return "unsatisfiable";
    return { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(a);
  const end = b === "" ? size - 1 : Number(b);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end) {
    // `bytes=5-2` n'est pas un intervalle valide : il est ignoré, pas refusé.
    return Number.isSafeInteger(start) && start >= size ? "unsatisfiable" : null;
  }
  if (start >= size) return "unsatisfiable";
  return { start, end: Math.min(end, size - 1) };
}
