// Personnes et crews de l'Explorer (lot R2, tour 2 : relectures Opus et Codex), en fonctions pures (testées).
// - Plus aucun annuaire : sans texte d'au moins deux caractères, aucune liste de personnes ; les filtres (centre
//   d'intérêt, grade) n'affinent qu'une recherche par texte, et ne trouvent que des comptes au détail visible (API).
// - Le lieu : `null` (rien de choisi) = suggestions de mon coin, recherche élargie d'elle-même à toute la France (dit à
//   l'écran) ; « Mon coin » choisi = l'un de mes départements ; « Ailleurs » = ce département ; « Partout » = rien.
// - Une lecture ne s'affiche que si elle est toujours la dernière et si le compte n'a pas changé (`requestGate`).
import {
  type CrewCard,
  hasPeopleSearchCriteria,
  type Page,
  type PeopleSearchPage,
  type PeopleSuggestions,
  type PeopleWhere,
  type PersonCard,
  peopleSearchPlace,
  peopleSuggestPlace,
} from "@orasso/shared";

import type { RequestTicket } from "@/lib/requestGate";
import type { PeopleFilters } from "./explorerChoice";

export type PeopleView =
  /** À l'ouverture : les suggestions ; `needText` : des filtres sont posés, mais sans texte ils ne listent personne. */
  | { mode: "suggest"; needText: boolean }
  | { mode: "tooShort" }
  /** `broadened` : aucun lieu choisi, la recherche porte sur toute la France. */
  | { mode: "search"; broadened: boolean };

export function peopleView(q: string, filters: PeopleFilters, where: PeopleWhere | null): PeopleView {
  const text = q.trim();
  if (!text) return { mode: "suggest", needText: Boolean(filters.categoryId || filters.grade) };
  if (!hasPeopleSearchCriteria({ q: text })) return { mode: "tooShort" };
  return { mode: "search", broadened: peopleSearchPlace(where, []).broadened };
}

export type PeopleFetchers = {
  searchPeople: (f: {
    q?: string;
    departments?: string;
    categoryId?: string;
    grade?: string;
    cursor?: string;
  }) => Promise<PeopleSearchPage>;
  searchCrews: (q: string, department?: string, departments?: string) => Promise<Page<CrewCard>>;
  suggestions: (departments?: string) => Promise<PeopleSuggestions>;
};

export type PeopleInput = {
  q: string;
  where: PeopleWhere | null;
  filters: PeopleFilters;
  coin: readonly string[];
  /** Lot R3b, tour 2 : les crews seulement (« Rejoindre un crew ») ; aucune lecture de personnes. */
  crewsOnly?: boolean;
};

export type SuggestResult = {
  kind: "suggest";
  sameModel: PeopleSuggestions["sameModel"];
  crews: CrewCard[];
  /** Le département des « Crews du 66 » (le premier du lieu), `null` partout en France. */
  crewDept: string | null;
};
export type SearchResult = { kind: "search"; people: PersonCard[]; cursor: string | null; crews: CrewCard[] };

/** Les paramètres de la recherche de personnes (page suivante comprise). */
export function peopleQuery(input: PeopleInput, cursor?: string) {
  const place = peopleSearchPlace(input.where, input.coin);
  return {
    q: input.q.trim(),
    departments: place.departments,
    categoryId: input.filters.categoryId || undefined,
    grade: input.filters.grade || undefined,
    cursor,
  };
}

/**
 * Lit ce qu'il faut montrer : les suggestions (sans texte), ou la recherche (texte d'au moins deux caractères).
 * `null` : la lecture n'est plus la dernière, ou le compte a changé entre-temps (la réponse est jetée). `tooShort` : rien.
 */
export async function loadPeople(
  ticket: RequestTicket,
  api: PeopleFetchers,
  input: PeopleInput,
): Promise<SuggestResult | SearchResult | null> {
  const view = peopleView(input.q, input.filters, input.where);
  if (view.mode === "tooShort") return null;
  if (view.mode === "suggest") {
    const near = peopleSuggestPlace(input.where, input.coin);
    const departments = near.length ? near.join(",") : undefined;
    const [s, crews] = await Promise.all([
      input.crewsOnly ? Promise.resolve({ sameModel: null }) : api.suggestions(departments),
      api.searchCrews("", undefined, departments),
    ]);
    if (!ticket.current()) return null;
    return { kind: "suggest", sameModel: s.sameModel, crews: crews.items, crewDept: near[0] ?? null };
  }
  const query = peopleQuery(input);
  const [people, crews] = await Promise.all([
    input.crewsOnly ? Promise.resolve({ items: [], nextCursor: null }) : api.searchPeople(query),
    api.searchCrews(query.q, undefined, query.departments),
  ]);
  if (!ticket.current()) return null;
  return { kind: "search", people: people.items, cursor: people.nextCursor, crews: crews.items };
}
