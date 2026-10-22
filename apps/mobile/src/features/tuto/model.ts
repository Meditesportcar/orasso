// Tutos par profil (lot 42) : les règles pures, testées seules. Les diapos sont dans `slides/`, les textes dans
// `@orasso/shared` (`tutoSlides`).
import { type MainProfile, mainProfiles } from "@orasso/shared";

/** Un profil de tuto (`exhibitor`, `visitor`, `pro`, `organizer`, `provider`, `media`) ou `null`. */
export function parseTutoProfile(value: string | string[] | undefined): MainProfile | null {
  const v = Array.isArray(value) ? value[0] : value;
  return (mainProfiles as readonly string[]).includes(v ?? "") ? (v as MainProfile) : null;
}

/** La clé mémorisée quand le tuto d'un profil a été vu (l'Accueil n'en propose plus la tuile). */
export const tutoSeenKey = (profile: MainProfile) => `tuto:${profile}`;

/**
 * Les clés posées à la fin du tuto d'arrivée : celle du profil, et celle du visiteur (barre affichée tant que la casquette
 * du profil n'est pas créée : exposant sans véhicule, pro, média…), pour qu'aucune tuile « Nouveau » ne suive le tuto.
 */
export function tutoKeysAfterArrival(profile: MainProfile): string[] {
  return [
    ...new Set(
      [profile, "visitor", ...(profile === "exhibitor" ? ["exhibitor"] : [])].map((p) => tutoSeenKey(p as MainProfile)),
    ),
  ];
}

/** La casquette d'un compte → le profil de son tuto (l'ancienne casquette « passionné » est l'exposant). */
export function tutoProfileOfPersona(kind: string): MainProfile | null {
  if (kind === "fan") return "exhibitor";
  return parseTutoProfile(kind);
}

/**
 * Les tutos à rejouer depuis Profil › Aide : le profil choisi à l'arrivée d'abord (la casquette de base, exposant ou
 * visiteur, à défaut), puis les autres casquettes du compte, chacune une fois.
 */
export function replayProfiles(personaKinds: readonly string[], mainProfile: MainProfile | null): MainProfile[] {
  const list: MainProfile[] = [];
  const push = (p: MainProfile | null) => {
    if (p && !list.includes(p)) list.push(p);
  };
  const fromPersonas = personaKinds.map(tutoProfileOfPersona);
  push(mainProfile);
  push(fromPersonas.find((p) => p === "exhibitor" || p === "visitor") ?? null);
  for (const p of fromPersonas) push(p);
  return list.length ? list : ["visitor"];
}

/** Diapo voisine (−1 précédente, +1 suivante), bornée aux diapos qui existent. */
export function stepIndex(index: number, direction: 1 | -1, count: number): number {
  return Math.min(count - 1, Math.max(0, index + direction));
}

/**
 * `text-wrap: balance` de l'artefact (titres des diapos) : le titre coupé en lignes de longueurs voisines, au même
 * nombre de lignes qu'un retour à la ligne ordinaire. `maxChars` : nombre de caractères qui tiennent sur une ligne.
 */
export function balanceTitle(text: string, maxChars: number): string {
  const words = text.split(" ");
  if (text.length <= maxChars || words.length < 2) return text;
  const lineLen = (ws: string[]) => ws.join(" ").length;
  for (let lines = Math.ceil(text.length / maxChars); lines <= words.length; lines++) {
    let best: string[][] | null = null;
    let bestMax = Number.POSITIVE_INFINITY;
    // Toutes les coupures possibles en `lines` lignes (titres courts : quelques mots).
    const walk = (start: number, left: number, acc: string[][]) => {
      if (left === 1) {
        const all = [...acc, words.slice(start)];
        const max = Math.max(...all.map(lineLen));
        // Une ligne tient, ou c'est un mot seul trop long pour tenir (police très agrandie) : il ne se coupe pas mieux.
        const fits = all.every((ws) => lineLen(ws) <= maxChars || ws.length === 1);
        if (fits && max < bestMax) {
          bestMax = max;
          best = all;
        }
        return;
      }
      for (let end = start + 1; end <= words.length - left + 1; end++)
        walk(end, left - 1, [...acc, words.slice(start, end)]);
    };
    walk(0, lines, []);
    if (best) return (best as string[][]).map((ws) => ws.join(" ")).join("\n");
  }
  return text;
}

/** Largeur d'un caractère du titre d'une diapo (26 px, 125 %, 900) : 358 px pour 17 caractères, relevé sur les paires. */
export const TITLE_CHAR_PX = 358 / 17;

/** Caractères qui tiennent sur une ligne de titre, pour la largeur d'écran et la taille de police de l'appareil. */
export function titleCharsFor(width: number, fontScale: number): number {
  return Math.max(8, Math.floor((width - 32) / (TITLE_CHAR_PX * fontScale)));
}
