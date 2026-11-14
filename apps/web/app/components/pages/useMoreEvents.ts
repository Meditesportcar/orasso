// « Voir plus » des événements d'une Page, sur le site (lot B2b, tour 1) : l'enveloppe React de `EventsPager` (packages/shared,
// testé là). La première page est lue par le serveur ; la suite se lit au curseur. Une réponse arrivée après une nouvelle
// lecture de la page est écartée, et la liste ne repart de zéro que si la structure ou le curseur de départ change.
import {
  type EventCard,
  type EventsPage,
  type EventsPageResult,
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

/** Un délai : une connexion qui pend ne bloque pas « Voir plus » (le bouton se réactive, la liste reste). */
export const EVENTS_READ_TIMEOUT_MS = 15_000;

/** Lit une page d'événements d'une structure ; une panne, un refus ou l'expiration du délai rendent `ok: false`. */
export async function readEventsPage(
  structureId: string,
  scope: "upcoming" | "past",
  cursor: string,
): Promise<EventsPageResult<EventCard>> {
  const res = await apiFetch<EventsPage<EventCard>>(
    structureEventsPath(structureId, scope, scope === "past" ? PAST_PAGE : UPCOMING_PAGE, cursor),
    { timeoutMs: EVENTS_READ_TIMEOUT_MS },
  );
  return res.ok ? { ok: true, data: res.data } : { ok: false };
}

export function useMoreEvents(
  structureId: string,
  scope: "upcoming" | "past",
  first: EventCard[] | null,
  firstNext: string | null,
  /** Le curseur d'où la première page a été lue (`null` : le début) : sans JavaScript, « Voir plus » est un lien. */
  start: string | null,
) {
  const key = eventsPagerKey(structureId, scope, start);
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
          return readEventsPage(id, kind, cursor);
        },
        setState,
        key,
        firstNext,
      ),
  );
  // Chaque lecture de la page (le tableau change à chaque lecture du chargeur) ouvre une génération : le pager repart de zéro si la
  // clé change, sinon relit les pages ajoutées en arrière-plan et les remplace d'un coup.
  // biome-ignore lint/correctness/useExhaustiveDependencies: déclenchée par chaque lecture (`first`) et par la clé
  useEffect(() => pager.onRead(key, firstNext, first !== null), [first, key]);
  // Avant que l'effet ne passe : la clé neuve montre déjà la liste neuve, jamais l'ancienne suite sur la nouvelle base.
  const cur = state.key === key ? state : freshEventsPagerState<EventCard>(key, firstNext);
  return {
    items: first === null ? null : mergeEvents(first, cur.extra),
    next: cur.pages === 0 ? firstNext : cur.next,
    failed: cur.failed,
    busy: cur.busy,
    more: () => pager.more(),
  };
}
