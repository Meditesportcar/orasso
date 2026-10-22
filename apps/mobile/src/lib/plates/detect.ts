// Détection de plaque sur l'appareil (lot 51, ARCHITECTURE-DA-V2 § 5.6, H3) : ML Kit lit le texte de la photo choisie,
// on garde les blocs dont le texte ressemble à une plaque française (SIV « AB-123-CD », FNI « 1234 AB 66 », et depuis
// le lot M2 W garage « W-623-AX », WW provisoire, diplomatiques ; filet de sécurité : une ligne de 5 à 9 lettres et
// chiffres dans un rectangle aux proportions d'une plaque est proposée comme plaque probable) et on propose leurs rectangles, agrandis de 15 %, normalisés 0–1, orientés comme la plaque (coins de ML Kit, lot 59c). Rien
// ne part au serveur : la personne confirme le cadre et seul le rectangle est envoyé avec la photo, qui est floutée par
// l'API. Web et Expo Go : pas de ML Kit, `null` (l'écran passe « À la main »).
import { formatPlate, type PlateRect } from "@orasso/shared";

import { recognizeText, type TextCorners, type TextFrame, type TextLineResult } from "./mlkit";
import { normalizePlateText, plateReadings } from "./recognize";

/** Agrandissement du rectangle détecté : la plaque entière, bords compris, est floutée. */
export const PLATE_GROW = 0.15;

// Analyseur des formes SIV / FNI : celui de `recognize.ts`, partagé avec l'accueil drive (lecture large ici).
export { normalizePlateText };

/**
 * Meilleure lecture d'un texte qui ressemble à une plaque (normalisée, « W623AX »), ou `null`. SIV, W garage, WW
 * (6 ou 7 caractères), FNI ou diplomatique (5 à 10), confusions tolérées. Le « F » de la bande européenne et le
 * département à droite d'une plaque SIV sont admis autour. La lecture la plus fidèle (format récent d'abord, puis le
 * moins de caractères relus) préremplit le numéro de plaque, que la personne confirme (lot M2).
 */
export function plateReadingOf(raw: string): string | null {
  const s = normalizePlateText(raw);
  if (s.length < 5) return null;
  const candidates = new Set([s]);
  if (s.startsWith("F") && s.length > 7) candidates.add(s.slice(1));
  for (const c of [...candidates]) {
    if (c.length === 9 || c.length === 10) candidates.add(c.slice(0, 7)); // « GA662KS66 », « GA662KS974 »
  }
  const readings = [...candidates].flatMap((c) => plateReadings(c, "wide"));
  readings.sort((a, b) => Number(b.siv) - Number(a.siv) || a.fixes - b.fixes);
  return readings[0]?.plate ?? null;
}

/** Le texte normalisé ressemble-t-il à une plaque ? (voir `plateReadingOf`) */
export const looksLikePlate = (raw: string): boolean => plateReadingOf(raw) !== null;

/** Filet de sécurité : proportions (largeur / hauteur) d'une ligne lue sur une plaque (520 × 110 mm, texte ≈ 5:1). */
export const PROBABLE_RATIO = { min: 2.5, max: 9 } as const;

/**
 * Lot M2, filet de sécurité : une ligne de 5 à 9 lettres et chiffres (les deux présents), dans un rectangle aux
 * proportions d'une plaque, est une plaque probable même sans format reconnu (plaque étrangère, lecture abîmée).
 */
export function probablePlate(text: string, frame: TextFrame | undefined): string | null {
  if (!frame || frame.height <= 0) return null;
  const s = normalizePlateText(text);
  if (s.length < 5 || s.length > 9 || !/[0-9]/.test(s) || !/[A-Z]/.test(s)) return null;
  const ratio = frame.width / frame.height;
  return ratio >= PROBABLE_RATIO.min && ratio <= PROBABLE_RATIO.max ? s : null;
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
  const rect: PlateRect = {
    x: round(clamp(cx / imageWidth - w / 2, 1 - w)),
    y: round(clamp(cy / imageHeight - h / 2, 1 - h)),
    w: round(w),
    h: round(h),
    angle,
  };
  // Lot 59c, tour 2 (relectures) : près d'un bord, le cadre borné à la photo est décalé et peut laisser un bout de plaque
  // dehors (l'API ne floute que le quadrilatère). Toute la partie visible de la plaque doit rester dans le cadre ; sinon
  // cadre droit englobant (`null` : l'appelant prend `toPlateRect`).
  return corners.every((quad) => frameCovers(rect, imageWidth, imageHeight, clipToImage(quad, imageWidth, imageHeight)))
    ? rect
    : null;
}

type Pt = { x: number; y: number };

/** Partie d'un polygone convexe (coins d'un mot) qui est dans la photo (Sutherland–Hodgman sur ses quatre bords). */
export function clipToImage(poly: readonly Pt[], width: number, height: number): Pt[] {
  const edges: [(p: Pt) => number, (a: Pt, b: Pt) => Pt][] = [
    [(p) => p.x, (a, b) => ({ x: 0, y: a.y + ((b.y - a.y) * (0 - a.x)) / (b.x - a.x) })],
    [(p) => width - p.x, (a, b) => ({ x: width, y: a.y + ((b.y - a.y) * (width - a.x)) / (b.x - a.x) })],
    [(p) => p.y, (a, b) => ({ x: a.x + ((b.x - a.x) * (0 - a.y)) / (b.y - a.y), y: 0 })],
    [(p) => height - p.y, (a, b) => ({ x: a.x + ((b.x - a.x) * (height - a.y)) / (b.y - a.y), y: height })],
  ];
  let out: Pt[] = [...poly];
  for (const [inside, cut] of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i] as Pt;
      const prev = input[(i + input.length - 1) % input.length] as Pt;
      const curIn = inside(cur) >= 0;
      const prevIn = inside(prev) >= 0;
      if (curIn) {
        if (!prevIn) out.push(cut(prev, cur));
        out.push(cur);
      } else if (prevIn) out.push(cut(prev, cur));
    }
    if (!out.length) break;
  }
  return out;
}

/** Tous les points (en pixels) sont-ils dans le cadre, tourné de son angle autour de son centre ? (aucune marge) */
export function frameCovers(rect: PlateRect, width: number, height: number, points: readonly Pt[]): boolean {
  const t = ((rect.angle ?? 0) * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const cx = (rect.x + rect.w / 2) * width;
  const cy = (rect.y + rect.h / 2) * height;
  const hw = (rect.w * width) / 2 + 1e-6;
  const hh = (rect.h * height) / 2 + 1e-6;
  return points.every((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    return Math.abs(dx * cos + dy * sin) <= hw && Math.abs(-dx * sin + dy * cos) <= hh;
  });
}

/** Une plaque repérée : son cadre, sa lecture (normalisée), et si elle ne vient que du filet de sécurité. */
export type FoundPlate = { rect: PlateRect; reading: string; probable: boolean };

/**
 * Plaques repérées dans les lignes lues. Dans chaque ligne, on essaie les suites de 1 à 4 mots consécutifs (une plaque
 * est souvent lue en trois mots) ; la suite la plus longue qui ressemble à une plaque gagne ; à défaut la ligne
 * entière, puis le filet de sécurité (`probablePlate`). Les plaques reconnues passent devant les probables (un panneau
 * peut aussi avoir les proportions d'une plaque). Quatre au plus.
 */
export function findPlates(lines: TextLineResult[], imageWidth: number, imageHeight: number): FoundPlate[] {
  const found: { frame: TextFrame; corners: TextCorners[]; reading: string; probable: boolean }[] = [];
  for (const line of lines) {
    const words = line.elements.filter((e) => e.frame);
    let matched = false;
    for (let size = Math.min(4, words.length); size >= 1 && !matched; size--) {
      for (let start = 0; start + size <= words.length; start++) {
        const run = words.slice(start, start + size);
        const reading = plateReadingOf(run.map((w) => w.text).join(""));
        if (reading) {
          const corners = run.flatMap((w) => (w.corners?.length === 4 ? [w.corners] : []));
          found.push({
            frame: union(run.map((w) => w.frame as TextFrame)),
            corners: corners.length === run.length ? corners : [],
            reading,
            probable: false,
          });
          matched = true;
          break;
        }
      }
    }
    if (matched || !line.frame) continue;
    const corners = line.corners?.length === 4 ? [line.corners] : [];
    const reading = plateReadingOf(line.text);
    if (reading) found.push({ frame: line.frame, corners, reading, probable: false });
    else {
      const probable = probablePlate(line.text, line.frame);
      if (probable) found.push({ frame: line.frame, corners, reading: probable, probable: true });
    }
  }
  found.sort((a, b) => Number(a.probable) - Number(b.probable));
  return found.slice(0, 4).map((f) => ({
    rect:
      (f.corners.length ? orientedPlateRect(f.corners, imageWidth, imageHeight) : null) ??
      toPlateRect(f.frame, imageWidth, imageHeight),
    reading: f.reading,
    probable: f.probable,
  }));
}

/** Rectangles des plaques repérées dans les lignes lues (voir `findPlates`). */
export function platesFromLines(lines: TextLineResult[], imageWidth: number, imageHeight: number): PlateRect[] {
  return findPlates(lines, imageWidth, imageHeight).map((f) => f.rect);
}

/**
 * Lot M2 : numéro à préremplir d'après les plaques repérées, au format lisible (« W-623-AX ») : la première plaque
 * reconnue, sinon la première probable ; `null` si rien n'a été lu. La personne le confirme ou le corrige.
 */
export function suggestedPlate(found: readonly Pick<FoundPlate, "reading" | "probable">[]): string | null {
  const best = found.find((f) => !f.probable) ?? found[0];
  return best ? formatPlate(best.reading) : null;
}

/**
 * Propose les plaques d'une photo locale, avec leur lecture. `null` : pas de détection possible ici (web, Expo Go,
 * erreur de ML Kit) ; tableau vide : aucune plaque repérée.
 */
export async function detectPlateReadings(uri: string, width: number, height: number): Promise<FoundPlate[] | null> {
  if (width <= 0 || height <= 0) return null;
  const lines = await recognizeText(uri);
  return lines ? findPlates(lines, width, height) : null;
}

/** Les cadres seuls (photo ajoutée après coup, contenus des médias). */
export async function detectPlates(uri: string, width: number, height: number): Promise<PlateRect[] | null> {
  const found = await detectPlateReadings(uri, width, height);
  return found ? found.map((f) => f.rect) : null;
}
