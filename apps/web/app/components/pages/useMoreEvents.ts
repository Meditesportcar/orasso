// « Voir plus » des événements d'une Page, sur le site (lot B2b, tour 1) : l'enveloppe React de `EventsPager` (packages/shared,
// testé là). La première page est lue par le serveur ; la suite se lit au curseur. Une réponse arrivée après une nouvelle
// lecture de la page est écartée, et la liste ne repart de zéro que si la structure ou le curseur de départ change.
import {
  type EventCard,
  type EventsPage,
  EventsPager,
  type EventsPagerState,
  eventsPagerKey,
  freshEventsPagerState,
  mergeEvents,
  structureEventsPath,
} from "@orasso/shared";
import { useEffect, useRef, useState } from "react";

import { apiFetch } from "../../lib/api.client";

export const UPCOMING_PAGE = 50;
export const PAST_PAGE = 12;

export function useMoreEvents(
  structureId: string,
  scope: "upcoming" | "past",
  first: EventCard[] | null,
  firstNext: string | null,
  /** Le curseur d'où la première page a été lue (`null` : le début) : sans JavaScript, « Voir plus » est un lien. */
  start: string | null,
) {
  const key = eventsPagerKey(structureId, scope, start, firstNext);
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
          const res = await apiFetch<EventsPage<EventCard>>(
            structureEventsPath(id, kind, kind === "past" ? PAST_PAGE : UPCOMING_PAGE, cursor),
          );
          return res.ok ? { ok: true, data: res.data } : { ok: false };
        },
        setState,
        key,
        firstNext,
      ),
  );
  // Une nouvelle lecture de la page : le pager juge, sur la clé, s'il repart de zéro ou garde ce qui a été ajouté.
  // biome-ignore lint/correctness/useExhaustiveDependencies: déclenchée par la clé seule (pas par l'identité des tableaux)
  useEffect(() => pager.sync(key, firstNext), [key]);
  // Avant que l'effet ne passe : la clé neuve montre déjà la liste neuve, jamais l'ancienne suite sur la nouvelle base.
  const cur = state.key === key ? state : freshEventsPagerState<EventCard>(key, firstNext);
  return {
    items: first === null ? null : mergeEvents(first, cur.extra),
    next: cur.next,
    failed: cur.failed,
    busy: cur.busy,
    more: () => pager.more(),
  };
}
