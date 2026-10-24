// Détection de plaque sur l'appareil (lot 51, ARCHITECTURE-DA-V2 § 5.6, H3) : ML Kit lit le texte de la photo choisie,
// on garde les blocs dont le texte ressemble à une plaque française (SIV « AB-123-CD », FNI « 1234 AB 66 », et depuis
// le lot M2 W garage « W-623-AX », WW provisoire, diplomatiques) et on propose leurs rectangles, agrandis de 15 %,
// normalisés 0–1, orientés comme la plaque (coins de ML Kit, lot 59c). Rien ne part au serveur : la personne confirme
// le cadre et seul le rectangle est envoyé avec la photo, qui est floutée par l'API. Web et Expo Go : pas de ML Kit,
// `null` (l'écran passe « À la main »). Filet de sécurité (lot M2) : une ligne qui a l'allure d'une plaque sans format
// reconnu est signalée « probable », jamais appliquée d'office (ni cadre, ni numéro) : la personne vérifie.
import { formatPlate, type PlateRect, plateKind } from "@orasso/shared";

import {
  type RecognizeResult,
  recognizeTextResult,
  type TextCorners,
  type TextFrame,
  type TextLineResult,
} from "./mlkit";
import { normalizePlateText, plateReadings } from "./recognize";

/** Agrandissement du rectangle détecté : la plaque entière, bords compris, est floutée. */
export const PLATE_GROW = 0.15;

// Analyseur des formes SIV / FNI : celui de `recognize.ts`, partagé avec l'accueil drive (lecture large ici).
export { normalizePlateText };

/**
 * Une lecture de plaque : le numéro (normalisé), le nombre de caractères relus (O → 0…), s'il est valide en lecture
 * stricte (`plateKind`), les bandes retirées autour (« F » à gauche, département à droite), et s'il est ambigu (une
 * autre lecture aussi bonne donne un autre numéro : on ne le propose pas).
 */
export type PlateRead = {
  plate: string;
  fixes: number;
  valid: boolean;
  stripped: number;
  tier: number;
  ambiguous: boolean;
};

const TRAILING_DEPT = /(\d{2,3}|2[AB])$/;

/** Bande « F » lue comme telle : un « F » de tête suivi d'un séparateur (mot à part, tiret), comme `normalizePlate`. */
const BAND_PREFIX = /^\s*F[\s\-.·]+/i;

/**
 * Classement des lectures (lot M2) : la plus fidèle d'abord, puis valide, puis le découpage préféré (`tier` : avec une
 * bande lue à part, sans le « F » ; sinon le texte entier avant la bande collée), puis la plus complète.
 */
const byQuality = (a: Omit<PlateRead, "ambiguous">, b: Omit<PlateRead, "ambiguous">) =>
  a.fixes - b.fixes || Number(b.valid) - Number(a.valid) || a.tier - b.tier || b.stripped - a.stripped;

/**
 * Meilleure lecture d'un texte qui ressemble à une plaque, ou `null`. SIV, W garage, WW, FNI ou diplomatique,
 * confusions tolérées ; la bande « F » et le département autour sont essayés retirés. Une FNI lue exactement passe
 * devant une SIV obtenue en relisant des caractères (« 256 BB 88 » n'est pas « ZS-688-BB »). Tour 3 : comme
 * `normalizePlate`, un « F » séparé du reste est une bande (« F W 623 AX » → W garage) ; collé, il fait d'abord partie
 * du numéro (« FW 123 AB » → SIV de série FW).
 */
export function readPlate(raw: string): PlateRead | null {
  const s = normalizePlateText(raw);
  if (s.length < 5) return null;
  const noF = s.startsWith("F") && s.length >= 6 ? s.slice(1) : null;
  const band = Boolean(noF) && BAND_PREFIX.test(raw);
  // [texte, bandes retirées, découpage] ; un département ne se retire qu'autour d'une plaque récente (SIV, W garage,
  // WW) : il fait partie du numéro d'une FNI ou d'une diplomatique.
  // [texte, bandes retirées, découpage, plaque récente seulement]
  const bases: [string, number, number, boolean][] = band
    ? [[noF as string, 1, 0, false]]
    : [[s, 0, 0, false], ...(noF ? ([[noF, 1, 1, false]] as [string, number, number, boolean][]) : [])];
  // Lot R3a : la bande bleue (étoiles, « F ») collée au numéro se lit souvent « I » ou « L » (« IEJ-706-EW ») : un
  // caractère de tête retiré, seulement devant une plaque récente (comme le département).
  if (!band && !noF && /^[IL]/.test(s) && s.length >= 8) bases.push([s.slice(1), 1, 1, true]);
  const candidates: [string, number, number, boolean][] = [...bases];
  for (const [c, n, t] of bases) {
    if (TRAILING_DEPT.test(c) && c.length >= 8) candidates.push([c.replace(TRAILING_DEPT, ""), n + 1, t, true]);
  }
  // Lot R3a : le W large de la police des plaques se lit souvent « VV » (« EJ-706-EVV ») : une relecture de plus.
  const reads = candidates
    .flatMap(([c, stripped, tier, sivOnly]) => {
      const variants: [string, number][] = [[c, 0]];
      if (c.includes("VV")) variants.push([c.replaceAll("VV", "W"), 1]);
      return variants.flatMap(([text, extra]) =>
        plateReadings(text, "wide")
          .filter((r) => !sivOnly || r.siv)
          .map((r) => ({
            plate: r.plate,
            fixes: r.fixes + extra,
            valid: plateKind(r.plate) !== null,
            stripped,
            tier,
          })),
      );
    })
    .sort(byQuality);
  const [best] = reads;
  if (!best) return null;
  const ambiguous = reads.some((r) => r.plate !== best.plate && byQuality(r, best) === 0);
  return { ...best, ambiguous };
}

/** Le numéro lu (voir `readPlate`), ou `null`. */
export const plateReadingOf = (raw: string): string | null => readPlate(raw)?.plate ?? null;

/** Le texte normalisé ressemble-t-il à une plaque ? (voir `readPlate`) */
export const looksLikePlate = (raw: string): boolean => readPlate(raw) !== null;

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

/**
 * Une plaque repérée : son cadre, sa lecture (voir `PlateRead`), et `probable` si elle ne vient que du filet de
 * sécurité (sans format reconnu) ou d'une lecture trop relue (`MAX_SURE_FIXES`) : elle n'est alors jamais appliquée d'office,
 * ni comme cadre de floutage, ni comme numéro ; l'écran la signale « à vérifier » (maquette à venir).
 */
export type FoundPlate = PlateRead & {
  rect: PlateRect;
  probable: boolean;
  /** Surface du cadre (0–1). */
  area: number;
};

/**
 * Plaques repérées dans les lignes lues. Dans chaque ligne, on essaie toutes les suites de 1 à 5 mots consécutifs
 * (une plaque est souvent lue en trois mots, plus la bande « F » et le département) et on garde la meilleure lecture
 * (`readPlate`), à qualité égale la suite la plus longue (le cadre couvre toute la plaque) ; à défaut la ligne
 * entière, puis le filet de sécurité (`probablePlate`). Les plaques reconnues passent devant les probables. Quatre au
 * plus.
 */
export function findPlates(lines: TextLineResult[], imageWidth: number, imageHeight: number): FoundPlate[] {
  const found: (PlateRead & { frame: TextFrame; corners: TextCorners[]; probable: boolean })[] = [];
  for (const line of lines) {
    const words = line.elements.filter((e) => e.frame);
    // Tour 3 : toutes les lectures de la ligne, avec leur place (mots `start` à `end`, exclus).
    const reads: (PlateRead & { start: number; end: number })[] = [];
    for (let size = Math.min(5, words.length); size >= 1; size--) {
      for (let start = 0; start + size <= words.length; start++) {
        const read = readPlate(
          words
            .slice(start, start + size)
            .map((w) => w.text)
            .join(" "),
        );
        if (read) reads.push({ ...read, start, end: start + size });
      }
    }
    // Tour 4 : les lectures se rangent en groupes de suites qui se chevauchent ; deux groupes disjoints sont deux
    // détections (« AB-123-CD PORSCHE 911 TURBO » : la plaque sûre garde son cadre, « 911 TUR 80 » reste à part).
    // Dans un groupe, la plaque est la plus longue suite lue (à longueur égale, la mieux lue) : une sous-suite
    // (« 123 CD 66 » dans « A8 123 CD 66 ») ne réduit jamais le cadre ; le cadre couvre l'union du groupe, et une
    // concurrente mieux lue qui donne un autre numéro rend la plaque ambiguë (pas de numéro).
    // Tour 5 : le regroupement ne passe que par des lectures sûres ; une lecture probable ne prolonge jamais un cadre
    // sûr (« CD 66 911 » ne relie pas « AB 123 CD 66 » au badge « 911 TURBO »). Les probables qui débordent d'un groupe
    // sûr forment leurs propres propositions, « à vérifier », jamais appliquées ; celles qui y sont incluses s'effacent.
    const chain = (list: typeof reads) => {
      const out: (typeof reads)[] = [];
      for (const r of [...list].sort((a, b) => a.start - b.start || b.end - a.end)) {
        const last = out.at(-1);
        if (last && r.start < Math.max(...last.map((x) => x.end))) last.push(r);
        else out.push([r]);
      }
      return out;
    };
    const sureGroups = chain(reads.filter((r) => r.fixes <= MAX_SURE_FIXES));
    const inside = (r: (typeof reads)[number]) =>
      sureGroups.some(
        (g) => r.start >= Math.min(...g.map((x) => x.start)) && r.end <= Math.max(...g.map((x) => x.end)),
      );
    const groups = [...sureGroups, ...chain(reads.filter((r) => r.fixes > MAX_SURE_FIXES && !inside(r)))];
    for (const group of groups) {
      const primary = [...group].sort((a, b) => b.end - b.start - (a.end - a.start) || byQuality(a, b))[0];
      if (!primary) continue;
      const start = Math.min(...group.map((r) => r.start));
      const end = Math.max(...group.map((r) => r.end));
      const run = words.slice(start, end);
      const rival = group.some(
        (r) =>
          r.plate !== primary.plate &&
          (r.fixes < primary.fixes || (r.fixes === primary.fixes && r.valid && !primary.valid)),
      );
      const corners = run.flatMap((w) => (w.corners?.length === 4 ? [w.corners] : []));
      const { start: _s, end: _e, ...read } = primary;
      found.push({
        ...read,
        ambiguous: read.ambiguous || rival,
        frame: union(run.map((w) => w.frame as TextFrame)),
        corners: corners.length === run.length ? corners : [],
        // Sûre si l'une des lectures du groupe l'est : le cadre (union) est alors appliqué.
        probable: group.every((r) => r.fixes > MAX_SURE_FIXES),
      });
    }
    if (groups.length) continue;
    if (!line.frame) continue;
    const corners = line.corners?.length === 4 ? [line.corners] : [];
    const read = readPlate(line.text);
    if (read) found.push({ ...read, frame: line.frame, corners, probable: read.fixes > MAX_SURE_FIXES });
    else {
      const probable = probablePlate(line.text, line.frame);
      if (probable) {
        found.push({
          plate: probable,
          fixes: 0,
          valid: false,
          stripped: 0,
          tier: 0,
          ambiguous: false,
          frame: line.frame,
          corners,
          probable: true,
        });
      }
    }
  }
  found.sort((a, b) => Number(a.probable) - Number(b.probable));
  return found.slice(0, 4).map(({ frame, corners, ...read }) => {
    const rect =
      (corners.length ? orientedPlateRect(corners, imageWidth, imageHeight) : null) ??
      toPlateRect(frame, imageWidth, imageHeight);
    return { ...read, rect, area: Math.round(rect.w * rect.h * 10000) / 10000 };
  });
}

/**
 * Au-delà de ce nombre de caractères relus, une lecture n'est plus sûre : « 911 TURBO » se relit en FNI « 911 TUR 80 »
 * (deux corrections). Elle devient probable : signalée, jamais appliquée d'office.
 */
export const MAX_SURE_FIXES = 1;

/** Les plaques à appliquer d'office (cadres de floutage) : jamais celles du filet de sécurité. */
export const surePlates = <T extends { probable: boolean }>(found: readonly T[]): T[] =>
  found.filter((f) => !f.probable);

/** Rectangles des plaques reconnues dans les lignes lues (voir `findPlates`), sans les probables. */
export function platesFromLines(lines: TextLineResult[], imageWidth: number, imageHeight: number): PlateRect[] {
  return surePlates(findPlates(lines, imageWidth, imageHeight)).map((f) => f.rect);
}

/** Écart de surface sous lequel deux plaques différentes, aussi bien lues, sont jugées ambiguës. */
const AREA_TIE = 1.5;

/**
 * Lot M2, tour 2 : numéro à préremplir d'après les plaques repérées (une ou plusieurs photos), au format lisible
 * (« W-623-AX »), ou `null`. Jamais une plaque probable ni une lecture ambiguë. Classement : la lecture la plus
 * fidèle, puis valide en lecture stricte, puis le plus grand cadre (la voiture photographiée). Deux plaques différentes
 * aussi bien lues et de tailles voisines : rien (la personne tape le numéro).
 */
export function suggestedPlate(
  found: readonly Pick<FoundPlate, "plate" | "fixes" | "valid" | "ambiguous" | "probable" | "area">[],
): string | null {
  const ranked = found
    .filter((f) => !f.probable)
    .sort((a, b) => a.fixes - b.fixes || Number(b.valid) - Number(a.valid) || b.area - a.area);
  const [best] = ranked;
  if (!best || best.ambiguous) return null;
  const rival = ranked.find(
    (f) => f.plate !== best.plate && f.fixes === best.fixes && f.valid === best.valid && best.area < f.area * AREA_TIE,
  );
  return rival ? null : formatPlate(best.plate);
}

/** Lot R3a : côté de la copie réduite du second essai, quand ML Kit ne lit rien sur une grande photo. */
export const RETRY_SIDE = 1024;

/** Raison d'une lecture impossible, montrée en petit à l'étape Plaque (phase de test) : code court, sans texte lu. */
export type DetectionFailure = "absent" | "no-text" | `error:${string}`;

export type DetectionResult = { found: FoundPlate[] | null; failure?: DetectionFailure; retried: boolean };

export type DetectionDeps = {
  recognize: (uri: string) => Promise<RecognizeResult>;
  /** Copie réduite (côté le plus long `side`) ; absente : pas de second essai. */
  shrink?: (uri: string, width: number, height: number, side: number) => Promise<{ uri: string; width: number; height: number }>;
};

/**
 * Lot R3a (demande du coordinateur) : lecture de la plaque avec sa raison d'échec, et un second essai sur une copie
 * réduite (`RETRY_SIDE`) quand ML Kit échoue ou ne lit aucune ligne sur une photo plus grande. Les cadres sont
 * normalisés (0–1) : ceux de la copie valent pour l'original. Module absent : pas de second essai.
 */
export async function detectWithRetry(
  uri: string,
  width: number,
  height: number,
  deps: DetectionDeps,
): Promise<DetectionResult> {
  if (width <= 0 || height <= 0) return { found: null, failure: "absent", retried: false };
  const first = await deps.recognize(uri).catch((e): RecognizeResult => ({ status: "error", code: String(e) }));
  if (first.status === "ok" && first.lines.length > 0) {
    return { found: logFound(findPlates(first.lines, width, height), width, height), retried: false };
  }
  if (first.status === "absent") return { found: null, failure: "absent", retried: false };
  let result: RecognizeResult = first;
  let size = { width, height };
  let retried = false;
  if (deps.shrink && Math.max(width, height) > RETRY_SIDE) {
    try {
      const small = await deps.shrink(uri, width, height, RETRY_SIDE);
      const second = await deps.recognize(small.uri);
      retried = true;
      console.info(`[plaque] second essai sur ${small.width}×${small.height}`);
      if (second.status === "ok" && second.lines.length > 0) {
        result = second;
        size = small;
      } else if (first.status === "ok" && second.status === "error") result = second;
    } catch (e) {
      console.warn(`[plaque] copie réduite impossible : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (result.status === "ok" && result.lines.length > 0) {
    // Les cadres sont normalisés sur la copie : ils valent pour l'original.
    return { found: logFound(findPlates(result.lines, size.width, size.height), width, height), retried };
  }
  if (result.status === "error") return { found: null, failure: `error:${result.code}`, retried };
  // Lecture faite sans aucune ligne : aucune plaque (tableau vide), avec la raison pour l'écran.
  return { found: [], failure: "no-text", retried };
}

function logFound(found: FoundPlate[], width: number, height: number): FoundPlate[] {
  // Trace de diagnostic au logcat (tailles et nombres seulement, jamais le texte ni le numéro).
  const sure = surePlates(found).length;
  console.info(`[plaque] photo ${width}×${height} : ${sure} plaque(s) sûre(s), ${found.length - sure} à vérifier`);
  return found;
}

/**
 * Propose les plaques d'une photo locale, avec leur lecture. `null` : pas de détection possible ici (web, Expo Go,
 * erreur de ML Kit) ; tableau vide : aucune plaque repérée.
 */
export async function detectPlateReadings(uri: string, width: number, height: number): Promise<FoundPlate[] | null> {
  return (await detectWithRetry(uri, width, height, { recognize: recognizeTextResult })).found;
}

/** Les cadres des plaques reconnues seuls (photo ajoutée après coup, contenus des médias) : jamais les probables. */
export async function detectPlates(uri: string, width: number, height: number): Promise<PlateRect[] | null> {
  const found = await detectPlateReadings(uri, width, height);
  return found ? surePlates(found).map((f) => f.rect) : null;
}
