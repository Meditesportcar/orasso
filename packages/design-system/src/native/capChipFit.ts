// Pastille de casquette de la barre du haut (`.capchip`) : rôle en entier ou logo rond. Pur : testé sans React Native.
//
// Correctif de la vague R4 (24/10) : un libellé ne se coupe jamais. Le lot C7 avait laissé la pastille rétrécir avec
// des points de suspension (« ORGANISAT… » à 390 px) ; la pastille montre désormais le rôle en entier quand il tient,
// sinon le logo rond seul (le rôle reste dans le libellé accessible).

import { tokens } from "../tokens";

const { spacing } = tokens;

/** Géométrie de la barre `tab` (`.appbar` de l'artefact), partagée avec `AppBar.tsx`. */
export const BAR_PAD_LEFT = 14;
export const BAR_PAD_RIGHT = 12;
export const BAR_GAP = 10;
/** `.abtn` : 38 px. */
export const BAR_ACTION = 38;
/** `.ab-logo` de l'artefact : 118 px (112 px sous 360 px). */
export const LOGO_WIDTH = 118;
export const LOGO_WIDTH_NARROW = 112;
export const LOGO_NARROW_BELOW = 360;

/** `.capchip` : 4 px à gauche, logo de 22 px, 6 px d'écart, le rôle, puis le remplissage de droite. */
export const CAPCHIP_PAD_LEFT = 4;
export const CAPCHIP_LOGO = 22;
export const CAPCHIP_GAP = 6;
/** 10 px dans l'artefact ; `space2` (8 px) depuis le correctif R4, pour « ORGANISATEUR » à 390 px (écart daté). */
export const CAPCHIP_PAD_RIGHT = spacing.space2;
/** Le texte de la pastille suit l'échelle de police du système jusqu'à 1,2 (`maxFontSizeMultiplier`). */
export const CAPCHIP_MAX_FONT_SCALE = 1.2;
/** Marge de sûreté (arrondis du rendu) : sans elle, un rôle « tout juste » pourrait se couper d'un pixel. */
export const CAPCHIP_SAFETY = 2;

const FONT_SIZE = 11;
/**
 * Largeur des rôles connus en em (Archivo 100 % 800, 11 px, capitales, interlettrage 0,03 em), mesurée dans Chrome
 * le 24/10 : « ORGANISATEUR » 97,5 px, « ADMINISTRATION » 106,3 px…
 */
const ROLE_EM: Record<string, number> = {
  Organisateur: 97.5 / FONT_SIZE,
  Administration: 106.35 / FONT_SIZE,
  Modération: 82.45 / FONT_SIZE,
  Prestataire: 83.05 / FONT_SIZE,
  Exposant: 67 / FONT_SIZE,
  Visiteur: 57.55 / FONT_SIZE,
  Média: 39.55 / FONT_SIZE,
  Staff: 38.2 / FONT_SIZE,
  Pro: 25.85 / FONT_SIZE,
};
/** Rôle inconnu : la capitale la plus large mesurée (« PRO » : 0,79 em par signe), pour ne jamais sous-estimer. */
const UNKNOWN_EM_PER_CHAR = 0.8;

/** Largeur du rôle écrit dans la pastille, en px, à l'échelle de police donnée. */
export function capChipTextWidth(role: string, fontScale = 1): number {
  const em = ROLE_EM[role] ?? role.length * UNKNOWN_EM_PER_CHAR;
  return em * FONT_SIZE * Math.min(Math.max(fontScale, 1), CAPCHIP_MAX_FONT_SCALE);
}

/** Place laissée à la pastille entière : l'écran moins le logotype, Recherche, Boîte (et ✕), les écarts et les marges. */
export function capChipRoom(width: number, withClose = false): number {
  const logo = width < LOGO_NARROW_BELOW ? LOGO_WIDTH_NARROW : LOGO_WIDTH;
  const actions = withClose ? 3 : 2;
  return width - BAR_PAD_LEFT - BAR_PAD_RIGHT - logo - actions * BAR_ACTION - (actions + 1) * BAR_GAP;
}

/**
 * La pastille passe au logo rond quand le rôle ne tient pas en entier (jamais de « … ») : la Boîte reste toujours dans
 * l'écran (lot C7).
 */
export function capChipCompact(input: {
  width: number;
  fontScale?: number;
  role?: string;
  withClose?: boolean;
}): boolean {
  if (!input.role) return true;
  const chip =
    CAPCHIP_PAD_LEFT + CAPCHIP_LOGO + CAPCHIP_GAP + capChipTextWidth(input.role, input.fontScale) + CAPCHIP_PAD_RIGHT;
  return chip + CAPCHIP_SAFETY > capChipRoom(input.width, input.withClose);
}
