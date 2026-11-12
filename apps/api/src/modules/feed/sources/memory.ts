// Source « Souvenir » du Fil (lot R7j, ARCHITECTURE-R7 § 2.9) : une carte **personnelle**, vue de moi seul. Elle ne lit que
// les tampons de la personne qui regarde (`input.userId`, jamais un identifiant reçu) : un autre compte ne la reçoit pas, même
// en suivant le mien. Le jour de l'anniversaire seulement (celui du parcours, `ref`), dans « Pour toi » seulement : ni dans
// « Autour de moi » ni dans « Mes abonnements », qui ne parlent pas de moi. Sa date est le début du jour local et son score
// est relevé (`boost`) : le souvenir du jour passe devant les nouveautés.
import { FEED_MEMORY_BOOST, memoryDayStart } from "@orasso/shared";

import { memoriesService } from "../../memories/service";
import type { FeedSource, Key, LoadedCard, SourceInput, SourceResult } from "./types";

/** Date décroissante, puis identifiant de carte décroissant (l'ordre du parcours par date). */
const compare = (a: Key, b: Key) => b.at.getTime() - a.at.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

/**
 * La carte est-elle strictement « après » la clé dans l'ordre du parcours ? Même sens que `beforeKeys` côté SQL : une clé sans
 * identifiant exclut sa date ; un autre genre à la même date suit l'ordre des noms de genre.
 */
function strictlyAfter(card: Key, k: Key): boolean {
  const sep = k.id.indexOf(":");
  if (sep < 0) return card.at < k.at;
  if (k.id.slice(0, sep) === "memory") return compare(card, k) > 0;
  return "memory" < k.id.slice(0, sep) ? card.at <= k.at : card.at < k.at;
}

export const source: FeedSource<"memory"> = {
  kind: "memory",
  async load(input: SourceInput): Promise<SourceResult<"memory">> {
    // Le souvenir du jour reste toujours dans la zone A (jamais « déjà vu ») : il n'a pas de zone B.
    if (input.filter !== "for_you" || input.zone === "B") return { cards: [], more: false, tail: null };
    const items = await memoriesService.todayFor(input.userId, input.ref);
    const at = memoryDayStart(input.ref);
    const all = items.map(
      (memory): LoadedCard<"memory"> => ({
        id: `memory:${memory.eventId}`,
        kind: "memory",
        at,
        // Personnelle : la proximité ne compte pas (celle du premier département de la personne, neutre).
        department: input.ctx.departments[0] ?? null,
        authorId: null,
        structureId: null,
        proId: null,
        categoryIds: [],
        boost: FEED_MEMORY_BOOST,
        payload: { memory },
      }),
    );
    const bounded = all
      .filter((c) => c.at <= input.until)
      .filter((c) => !input.since || c.at >= input.since)
      .filter((c) => input.before.every((k) => strictlyAfter(c, k)))
      // La borne figée est incluse : tout sauf « strictement après elle ».
      .filter((c) => !input.floor || !strictlyAfter(c, input.floor))
      .sort(compare);
    const cards = bounded.slice(0, input.limit);
    const last = cards.at(-1);
    return { cards, more: bounded.length > input.limit, tail: last ? { at: last.at, id: last.id } : null };
  },
};
