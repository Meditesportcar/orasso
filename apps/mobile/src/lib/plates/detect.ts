// Détection de plaque sur l'appareil (lot 51, ARCHITECTURE-DA-V2 § 5.6, H3) : ML Kit lit le texte de la photo choisie,
// on garde les blocs dont le texte ressemble à une plaque française (SIV « AB-123-CD », FNI « 1234 AB 66 ») et on
// propose leurs rectangles, agrandis de 15 %, normalisés 0–1. Rien ne part au serveur : la personne confirme le cadre
// et seul le rectangle est envoyé avec la photo, qui est floutée par l'API. Web et Expo Go : pas de ML Kit, `null`
// (l'écran passe « À la main »).
import type { PlateRect } from "@orasso/shared";

import { recognizeText, type TextFrame, type TextLineResult } from "./mlkit";

/** Agrandissement du rectangle détecté : la plaque entière, bords compris, est floutée. */
export const PLATE_GROW = 0.15;

/** Lettres et chiffres que la lecture confond le plus souvent (photo de biais, reflets). */
const AS_DIGIT: Record<string, string> = {
  O: "0",
  Q: "0",
  D: "0",
  I: "1",
  L: "1",
  Z: "2",
  S: "5",
  G: "6",
  B: "8",
  T: "7",
};
const AS_LETTER: Record<string, string> = { "0": "O", "1": "I", "2": "Z", "5": "S", "6": "G", "8": "B", "7": "T" };

/** Majuscules, lettres et chiffres seulement (« ga-662 ks » → « GA662KS »). */
export const normalizePlateText = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

/** Le caractère convient-il à la classe (L lettre, D chiffre), confusions tolérées ? */
function fits(ch: string, cls: "L" | "D"): boolean {
  if (cls === "D") return /[0-9]/.test(ch) || ch in AS_DIGIT;
  return /[A-Z]/.test(ch) || ch in AS_LETTER;
}

function fitsShape(s: string, shape: string): boolean {
  if (s.length !== shape.length) return false;
  for (let i = 0; i < s.length; i++) if (!fits(s[i] as string, shape[i] as "L" | "D")) return false;
  // Au moins un vrai chiffre et une vraie lettre : « OOOOOOO » ou « 8888888 » ne sont pas des plaques.
  return /[0-9]/.test(s) && /[A-Z]/.test(s);
}

/** Formes FNI : 1 à 4 chiffres, 1 à 3 lettres, département sur 2 chiffres (ou 3 outre-mer), 2A / 2B pour la Corse. */
const FNI_SHAPES: string[] = [];
for (let d = 1; d <= 4; d++) {
  for (let l = 1; l <= 3; l++) {
    for (const dept of ["DD", "DDD", "DL"]) FNI_SHAPES.push(`${"D".repeat(d)}${"L".repeat(l)}${dept}`);
  }
}
const SIV_SHAPE = "LLDDDLL";

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
    if (fitsShape(c, SIV_SHAPE)) return true;
    if (c.length >= 5 && FNI_SHAPES.some((shape) => fitsShape(c, shape))) return true;
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

/**
 * Rectangles des plaques repérées dans les lignes lues. Dans chaque ligne, on essaie les suites de 1 à 4 mots
 * consécutifs (une plaque est souvent lue en trois mots) ; la suite la plus longue qui ressemble à une plaque gagne.
 */
export function platesFromLines(lines: TextLineResult[], imageWidth: number, imageHeight: number): PlateRect[] {
  const found: TextFrame[] = [];
  for (const line of lines) {
    const words = line.elements.filter((e) => e.frame);
    let matched = false;
    for (let size = Math.min(4, words.length); size >= 1 && !matched; size--) {
      for (let start = 0; start + size <= words.length; start++) {
        const run = words.slice(start, start + size);
        if (looksLikePlate(run.map((w) => w.text).join(""))) {
          found.push(union(run.map((w) => w.frame as TextFrame)));
          matched = true;
          break;
        }
      }
    }
    if (!matched && line.frame && looksLikePlate(line.text)) found.push(line.frame);
  }
  return found.slice(0, 4).map((f) => toPlateRect(f, imageWidth, imageHeight));
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
