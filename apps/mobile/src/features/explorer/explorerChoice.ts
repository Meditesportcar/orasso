// Le choix de l'Explorer reste (lot R1, retour de Damien du 24/10 : « les sélecteurs ne gardent pas le choix ») :
// segment, tri, « Autour de… », distance et filtres sont gardés sur l'appareil, rangés par compte (`cacheScope()` de
// `kv.ts` : un autre compte ne les lit jamais, la déconnexion les efface). Ils restent d'un onglet à l'autre et après un
// redémarrage. « Autour de moi » ne garde que le mode : jamais de coordonnées. Le texte de recherche n'est pas gardé.
// Logique pure (testée) : lecture prudente d'une valeur enregistrée, chaque champ illisible reprend sa valeur par défaut.
import { departments, eventFormats, proActivities } from "@orasso/shared";

import {
  type Around,
  EVENT_SORTS,
  type EventFilters,
  type EventSort,
  emptyEventFilters,
  emptyProFilters,
  type ProFilters,
  RADII,
  type When,
} from "./queries";

/** Clé du cache du compte. */
export const CHOICE_KEY = "explorer-choice";

export type ExplorerSegment = "evenements" | "pros";
export const EXPLORER_SEGMENTS: readonly ExplorerSegment[] = ["evenements", "pros"];

export type ExplorerChoice = {
  segment: ExplorerSegment;
  sort: EventSort;
  /** `null` : pas de choix (la position si elle est activée, sinon Mon coin). */
  around: Around | null;
  /** `undefined` : la distance habituelle des préférences ; `null` : partout en France. */
  radius: number | null | undefined;
  /** Les filtres choisis (les types des préférences s'y ajoutent à l'affichage, ils ne sont pas gardés ici). */
  filters: Omit<EventFilters, "formats">;
  /** Les types de « Tes préférences » s'appliquent (faux après un format choisi à la main). */
  prefFormatsOn: boolean;
  pros: ProFilters;
};

export const defaultChoice: ExplorerChoice = {
  segment: "evenements",
  sort: "distance",
  around: null,
  radius: undefined,
  filters: { format: emptyEventFilters.format, when: emptyEventFilters.when, affinity: false, followed: false },
  prefFormatsOn: true,
  pros: emptyProFilters,
};

const WHENS: readonly When[] = ["all", "weekend", "month"];
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const oneOf = <T>(list: readonly T[], v: unknown, fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const isRadius = (v: unknown): v is number => (RADII as readonly unknown[]).includes(v);

function readAround(v: unknown): Around | null {
  if (!isObject(v)) return null;
  if (v.kind === "mine") return { kind: "mine" };
  // « Autour de moi » : le mode seulement, quoi que contienne la valeur enregistrée.
  if (v.kind === "me") return { kind: "me" };
  if (v.kind === "dept" && (departments as readonly unknown[]).includes(v.code))
    return { kind: "dept", code: v.code as string };
  return null;
}

/** Une valeur enregistrée (ou rien) → le choix, champ par champ ; `null` si rien n'a jamais été gardé. */
export function readChoice(raw: unknown): ExplorerChoice | null {
  if (!isObject(raw)) return null;
  const f = isObject(raw.filters) ? raw.filters : {};
  const p = isObject(raw.pros) ? raw.pros : {};
  return {
    segment: oneOf(EXPLORER_SEGMENTS, raw.segment, defaultChoice.segment),
    sort: oneOf(EVENT_SORTS, raw.sort, defaultChoice.sort),
    around: readAround(raw.around),
    // JSON n'a pas d'`undefined` : « prefs » = la distance des préférences.
    radius: raw.radius === null ? null : isRadius(raw.radius) ? raw.radius : undefined,
    filters: {
      format: oneOf(["", ...eventFormats] as const, f.format, ""),
      when: oneOf(WHENS, f.when, "all"),
      affinity: f.affinity === true,
      followed: f.followed === true,
    },
    prefFormatsOn: raw.prefFormatsOn !== false,
    pros: {
      activity: oneOf(["", ...proActivities] as const, p.activity, ""),
      department: oneOf(["", ...departments] as const, p.department, ""),
      radiusKm: isRadius(p.radiusKm) ? p.radiusKm : null,
    },
  };
}

/** Le choix → la valeur à garder (jamais de position : « Autour de moi » est un mode). */
export function storeChoice(choice: ExplorerChoice): Record<string, unknown> {
  const a = choice.around;
  return {
    segment: choice.segment,
    sort: choice.sort,
    around: a === null ? null : a.kind === "dept" ? { kind: "dept", code: a.code } : { kind: a.kind },
    radius: choice.radius === undefined ? "prefs" : choice.radius,
    filters: {
      format: choice.filters.format,
      when: choice.filters.when,
      affinity: choice.filters.affinity,
      followed: choice.filters.followed,
    },
    prefFormatsOn: choice.prefFormatsOn,
    pros: { activity: choice.pros.activity, department: choice.pros.department, radiusKm: choice.pros.radiusKm },
  };
}
