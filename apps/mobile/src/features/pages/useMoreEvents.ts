// « Voir plus » des événements d'une Page, dans l'appli (lot B2b, tour 1, parité D20 avec le site) : l'enveloppe React de
// `EventsPager` (packages/shared, testé là), la même logique que celle du site. La première page est lue par l'écran (50 à venir,
// 12 passés) ; la suite se lit au curseur, une réponse d'avant une nouvelle lecture est écartée, et la liste ne repart de zéro
// que si la structure ou le curseur de la première page change.
import {
  type EventCard,
  EventsPager,
  type EventsPagerState,
  eventsPagerKey,
  freshEventsPagerState,
  mergeEvents,
  type Page,
} from "@orasso/shared";
import { useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";

export const UPCOMING_PAGE = 50;
export const PAST_PAGE = 12;

/** Ce que l'écran montre sous une liste : « Voir plus », « Réessayer » après un échec, jamais une liste vidée par une panne. */
export type MoreEventsView = { next: string | null; failed: boolean; busy: boolean; onMore: () => void };

export function useMoreEvents(
  structureId: string | undefined,
  scope: "upcoming" | "past",
  first: Page<EventCard> | null,
): { items: EventCard[] | null; more: MoreEventsView } {
  const firstNext = first?.nextCursor ?? null;
  const key = eventsPagerKey(structureId ?? "", scope, null);
  const where = useRef({ structureId, scope });
  where.current = { structureId, scope };
  const [state, setState] = useState<EventsPagerState<EventCard>>(() =>
    freshEventsPagerState<EventCard>(key, firstNext),
  );
  const [pager] = useState(
    () =>
      new EventsPager<EventCard>(
        async (cursor) => {
          const { structureId: id, scope: kind } = where.current;
          // Une panne (réseau, 5xx) lève : le pager la dit sans toucher à la liste affichée.
          const data = await api.exploreEvents({
            structureId: id,
            ...(kind === "past" ? { scope: "past" as const } : { sort: "date" as const }),
            limit: kind === "past" ? PAST_PAGE : UPCOMING_PAGE,
            cursor,
          });
          return { ok: true, data };
        },
        setState,
        key,
        firstNext,
      ),
  );
  // Chaque lecture de la première page (la réponse change à chaque lecture) ouvre une génération : remise à zéro si la clé change,
  // sinon les pages ajoutées sont relues en arrière-plan et remplacées d'un coup.
  // biome-ignore lint/correctness/useExhaustiveDependencies: déclenchée par chaque lecture (`first`) et par la clé
  useEffect(() => pager.onRead(key, firstNext, first !== null), [first, key]);
  const cur = state.key === key ? state : freshEventsPagerState<EventCard>(key, firstNext);
  return {
    items: first ? mergeEvents(first.items, cur.extra) : null,
    more: {
      next: cur.pages === 0 ? firstNext : cur.next,
      failed: cur.failed,
      busy: cur.busy,
      onMore: () => void pager.more(),
    },
  };
}
