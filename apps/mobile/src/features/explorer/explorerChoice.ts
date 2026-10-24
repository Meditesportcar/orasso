// Le choix de l'Explorer reste (lot R1, retour de Damien du 24/10 : « les sélecteurs ne gardent pas le choix ») : il
// est gardé sur l'appareil, rangé par compte (`cacheScope()` de `kv.ts` : un autre compte ne le lit jamais, la
// déconnexion l'efface). Il reste d'un onglet à l'autre et après un redémarrage. Le texte de recherche n'est pas gardé.
// Lot R2 (maquette « Explorer R2 ») : le segment (Événements, Pros, Personnes et crews), le lieu (« Où chercher ? »,
// commun aux Événements et aux Pros ; `null` = tes réglages habituels), le tri des événements (par date par défaut) et
// des pros (par distance), les filtres, le métier, et pour Personnes et crews le département, « Montrer » et les filtres.
// « Autour de moi » ne garde que le mode et la distance : jamais de coordonnées.
// Logique pure (testée) : lecture prudente d'une valeur enregistrée, chaque champ illisible reprend sa valeur par défaut.
import {
  departments,
  type ExplorerWhere,
  eventFormats,
  type Grade,
  grades,
  type PeopleWhere,
  type ProActivity,
  proActivities,
  readWhere,
} from "@orasso/shared";

import { EVENT_SORTS, type EventFilters, type EventSort, emptyEventFilters, type When } from "./queries";

/** Clé du cache du compte. */
export const CHOICE_KEY = "explorer-choice";

export type ExplorerSegment = "evenements" | "pros" | "personnes";
export const EXPLORER_SEGMENTS: readonly ExplorerSegment[] = ["evenements", "pros", "personnes"];

export const PRO_SORTS = ["distance", "name"] as const;
export type ProSort = (typeof PRO_SORTS)[number];
export const PEOPLE_SHOWS = ["all", "people", "crews"] as const;
export type PeopleShow = (typeof PEOPLE_SHOWS)[number];
/** Personnes et crews : des départements seulement, jamais de position ni de distance (docs/01). Règles : `@orasso/shared`. */
export type { PeopleWhere };
export type PeopleFilters = { categoryId: string; grade: Grade | "" };
export const emptyPeopleFilters: PeopleFilters = { categoryId: "", grade: "" };

export type ExplorerChoice = {
  segment: ExplorerSegment;
  /** Le lieu choisi ; `null` : tes réglages habituels. */
  where: ExplorerWhere | null;
  sort: EventSort;
  /** Les filtres choisis (les types des préférences s'y ajoutent à l'affichage, ils ne sont pas gardés ici). */
  filters: Omit<EventFilters, "formats">;
  /** Les types de « Tes préférences » s'appliquent (faux après un format choisi à la main). */
  prefFormatsOn: boolean;
  job: ProActivity | "";
  proSort: ProSort;
  /** Lot R2, tour 2 : `null` = rien de choisi (suggestions de mon coin, recherche élargie à toute la France). */
  peopleWhere: PeopleWhere | null;
  show: PeopleShow;
  people: PeopleFilters;
};

export const defaultChoice: ExplorerChoice = {
  segment: "evenements",
  where: null,
  // Décision de Damien (lot R2) : par date pour les événements, par distance pour les pros.
  sort: "date",
  filters: { format: emptyEventFilters.format, when: emptyEventFilters.when, affinity: false, followed: false },
  prefFormatsOn: true,
  job: "",
  proSort: "distance",
  peopleWhere: null,
  show: "all",
  people: emptyPeopleFilters,
};

/** Version de la valeur gardée : avant le lot R2, « Autour de… » et le tri par distance par défaut (non repris). */
const VERSION = 2;
const WHENS: readonly When[] = ["all", "weekend", "month"];
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const oneOf = <T>(list: readonly T[], v: unknown, fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const isDepartment = (code: string) => (departments as readonly string[]).includes(code);

function readPeopleWhere(v: unknown): PeopleWhere | null {
  if (!isObject(v)) return null;
  if (v.kind === "mine") return { kind: "mine" };
  if (v.kind === "all") return { kind: "all" };
  if (v.kind === "dept" && typeof v.code === "string" && isDepartment(v.code)) return { kind: "dept", code: v.code };
  return null;
}

/** Relecture du lot R2 : un identifiant de centre d'intérêt abîmé est ignoré (UUID seulement). */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Une valeur enregistrée (ou rien) → le choix, champ par champ ; `null` si rien n'a jamais été gardé. */
export function readChoice(raw: unknown): ExplorerChoice | null {
  if (!isObject(raw)) return null;
  const f = isObject(raw.filters) ? raw.filters : {};
  const legacy = raw.v !== VERSION;
  // Avant le lot R2 : le métier était dans `pros.activity`.
  const job = legacy && isObject(raw.pros) ? raw.pros.activity : raw.job;
  const people = isObject(raw.people) ? raw.people : {};
  return {
    segment: oneOf(EXPLORER_SEGMENTS, raw.segment, defaultChoice.segment),
    // Avant le lot R2, « Autour de… » et sa distance : on repart des réglages habituels (le tri par date aussi).
    where: legacy ? null : readWhere(raw.where, isDepartment),
    sort: legacy ? defaultChoice.sort : oneOf(EVENT_SORTS, raw.sort, defaultChoice.sort),
    filters: {
      format: oneOf(["", ...eventFormats] as const, f.format, ""),
      when: oneOf(WHENS, f.when, "all"),
      affinity: f.affinity === true,
      followed: f.followed === true,
    },
    prefFormatsOn: raw.prefFormatsOn !== false,
    job: oneOf(["", ...proActivities] as const, job, ""),
    proSort: oneOf(PRO_SORTS, raw.proSort, defaultChoice.proSort),
    peopleWhere: readPeopleWhere(raw.peopleWhere),
    show: oneOf(PEOPLE_SHOWS, raw.show, defaultChoice.show),
    people: {
      categoryId: typeof people.categoryId === "string" && UUID.test(people.categoryId) ? people.categoryId : "",
      grade: oneOf(["", ...grades] as const, people.grade, ""),
    },
  };
}

/** Le choix → la valeur à garder (jamais de position : « Autour de moi » est un mode et une distance). */
export function storeChoice(choice: ExplorerChoice): Record<string, unknown> {
  const w = choice.where;
  return {
    v: VERSION,
    segment: choice.segment,
    where:
      w === null
        ? null
        : w.kind === "me"
          ? { kind: "me", km: w.km }
          : w.kind === "dept"
            ? { kind: "dept", code: w.code }
            : { kind: w.kind },
    sort: choice.sort,
    filters: {
      format: choice.filters.format,
      when: choice.filters.when,
      affinity: choice.filters.affinity,
      followed: choice.filters.followed,
    },
    prefFormatsOn: choice.prefFormatsOn,
    job: choice.job,
    proSort: choice.proSort,
    peopleWhere:
      choice.peopleWhere === null
        ? null
        : choice.peopleWhere.kind === "dept"
          ? { kind: "dept", code: choice.peopleWhere.code }
          : { kind: choice.peopleWhere.kind },
    show: choice.show,
    people: { categoryId: choice.people.categoryId, grade: choice.people.grade },
  };
}
