// Détection de plaque sur l'appareil (lot 51, ARCHITECTURE-DA-V2 § 5.6, H3) : ML Kit lit le texte de la photo choisie,
// on garde les blocs dont le texte ressemble à une plaque française (SIV « AB-123-CD », FNI « 1234 AB 66 ») et on
// propose leurs rectangles, agrandis de 15 %, normalisés 0–1, orientés comme la plaque (coins de ML Kit, lot 59c). Rien
// ne part au serveur : la personne confirme le cadre et seul le rectangle est envoyé avec la photo, qui est floutée par
// l'API. Web et Expo Go : pas de ML Kit, `null` (l'écran passe « À la main »).
import type { PlateRect } from "@orasso/shared";

import { recognizeText, type TextCorners, type TextFrame, type TextLineResult } from "./mlkit";
import { normalizePlateText, plateReadings } from "./recognize";

/** Agrandissement du rectangle détecté : la plaque entière, bords compris, est floutée. */
export const PLATE_GROW = 0.15;

// Analyseur des formes SIV / FNI : celui de `recognize.ts`, partagé avec l'accueil drive (lecture large ici).
export { normalizePlateText };

/**
 * Le texte normalisé ressemble-t-il à une plaque ? SIV (7 caractères) ou FNI (5 à 10), confusions tolérées. Le « F »
 * de la bande européenne et le département à droite d'une plaque SIV sont admis autour.
 */
export function looksLikePlate(raw: string): boolean {
  const s = normalizePlateText(raw);
  if (s.length < 5) return false;
  const candidates = new Set([s]);
  if (s.startsWith("F") && s.length > 7) candidates.add(s.slice(1));
  for (const c of [...candidates]) {
    if (c.length === 9 || c.length === 10) candidates.add(c.slice(0, 7)); // « GA662KS66 », « GA662KS974 »
  }
  for (const c of candidates) {
    if (plateReadings(c, "wide").length > 0) return true;
  }
  return false;
}

/** Union de cadres en pixels. */
function union(frames: TextFrame[]): TextFrame {
  const left = Math.min(...frames.map((f) => f.left));
  const top = Math.min(...frames.map((f) => f.top));
  const right = Math.max(...frames.map((f) => f.left + f.width));
  const bottom = Math.max(...frames.map((f) => f.top + f.height));
  return { left, top, width: right - left, height: bottom - top };
}

/** Cadre en pixels → rectangle normalisé, agrandi de `grow` autour de son centre et borné à l'image. */
export function toPlateRect(frame: TextFrame, imageWidth: number, imageHeight: number, grow = PLATE_GROW): PlateRect {
  const w = frame.width * (1 + grow);
  const h = frame.height * (1 + grow);
  const cx = frame.left + frame.width / 2;
  const cy = frame.top + frame.height / 2;
  const x0 = Math.max(0, (cx - w / 2) / imageWidth);
  const y0 = Math.max(0, (cy - h / 2) / imageHeight);
  const x1 = Math.min(1, (cx + w / 2) / imageWidth);
  const y1 = Math.min(1, (cy + h / 2) / imageHeight);
  const round = (n: number) => Math.round(n * 10000) / 10000;
  return { x: round(x0), y: round(y0), w: round(Math.max(0.01, x1 - x0)), h: round(Math.max(0.01, y1 - y0)) };
}

/** Angle (degrés) sous lequel une plaque lue est considérée droite : cadre sans rotation, comme avant le lot 59c. */
export const PLATE_TILT_MIN = 2;

/**
 * Lot 59c : cadre orienté à partir des coins de ML Kit (plaque penchée). L'angle est celui du bord haut du premier mot
 * (du haut gauche au haut droit) ; le cadre est la plus petite boîte, dans ce repère tourné, qui contient tous les coins,
 * agrandie de `grow` autour de son centre ; le rectangle avant rotation reste dans la photo (décalé si besoin).
 * `null` si l'angle est sous `PLATE_TILT_MIN` (ou au-delà de 60°, lecture douteuse) : on garde le cadre droit.
 */
export function orientedPlateRect(
  corners: readonly TextCorners[],
  imageWidth: number,
  imageHeight: number,
  grow = PLATE_GROW,
): PlateRect | null {
  const [a, b] = corners[0] ?? [];
  const points = corners.flat();
  if (!a || !b || points.length < 4) return null;
  const raw = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  if (!Number.isFinite(raw) || Math.abs(raw) < PLATE_TILT_MIN || Math.abs(raw) > 60) return null;
  const angle = Math.round(raw * 10) / 10;
  const t = (angle * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  // Coordonnées dans le repère du cadre (rotation inverse), puis centre ramené dans celui de la photo.
  const us = points.map((p) => p.x * cos + p.y * sin);
  const vs = points.map((p) => -p.x * sin + p.y * cos);
  const u0 = Math.min(...us);
  const u1 = Math.max(...us);
  const v0 = Math.min(...vs);
  const v1 = Math.max(...vs);
  const cu = (u0 + u1) / 2;
  const cv = (v0 + v1) / 2;
  const cx = cu * cos - cv * sin;
  const cy = cu * sin + cv * cos;
  const w = Math.min(1, Math.max(0.01, ((u1 - u0) * (1 + grow)) / imageWidth));
  const h = Math.min(1, Math.max(0.01, ((v1 - v0) * (1 + grow)) / imageHeight));
  const clamp = (n: number, max: number) => Math.min(max, Math.max(0, n));
  const round = (n: number) => Math.round(n * 10000) / 10000;
  return {
    x: round(clamp(cx / imageWidth - w / 2, 1 - w)),
    y: round(clamp(cy / imageHeight - h / 2, 1 - h)),
    w: round(w),
    h: round(h),
    angle,
  };
}

/**
 * Rectangles des plaques repérées dans les lignes lues. Dans chaque ligne, on essaie les suites de 1 à 4 mots
 * consécutifs (une plaque est souvent lue en trois mots) ; la suite la plus longue qui ressemble à une plaque gagne.
 */
export function platesFromLines(lines: TextLineResult[], imageWidth: number, imageHeight: number): PlateRect[] {
  const found: { frame: TextFrame; corners: TextCorners[] }[] = [];
  for (const line of lines) {
    const words = line.elements.filter((e) => e.frame);
    let matched = false;
    for (let size = Math.min(4, words.length); size >= 1 && !matched; size--) {
      for (let start = 0; start + size <= words.length; start++) {
        const run = words.slice(start, start + size);
        if (looksLikePlate(run.map((w) => w.text).join(""))) {
          const corners = run.flatMap((w) => (w.corners?.length === 4 ? [w.corners] : []));
          found.push({
            frame: union(run.map((w) => w.frame as TextFrame)),
            corners: corners.length === run.length ? corners : [],
          });
          matched = true;
          break;
        }
      }
    }
    if (!matched && line.frame && looksLikePlate(line.text))
      found.push({ frame: line.frame, corners: line.corners?.length === 4 ? [line.corners] : [] });
  }
  return found
    .slice(0, 4)
    .map(
      (f) =>
        (f.corners.length ? orientedPlateRect(f.corners, imageWidth, imageHeight) : null) ??
        toPlateRect(f.frame, imageWidth, imageHeight),
    );
}

/**
 * Propose les plaques d'une photo locale. `null` : pas de détection possible ici (web, Expo Go, erreur de ML Kit) ;
 * tableau vide : aucune plaque repérée.
 */
export async function detectPlates(uri: string, width: number, height: number): Promise<PlateRect[] | null> {
  if (width <= 0 || height <= 0) return null;
  const lines = await recognizeText(uri);
  return lines ? platesFromLines(lines, width, height) : null;
}
