// La liste des demandes (lot R7c2) : `GET /me/requests` (50 par page, « Voir plus »), une carte par sorte (registre
// `requests/index.ts`). Elle sert deux écrans : « Demandes » de l'Activité (tout sauf les demandes de message) et « Demandes
// de message » de Messages (seulement elles). Une panne n'est pas une liste vide (« Réessayer »).
import type { RequestItem, RequestsPage } from "@orasso/shared";
import { useCallback } from "react";
import { View } from "react-native";

import { SmallButton } from "@/features/sorties/bits";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useTail } from "@/lib/tailPages";
import { useApi } from "@/lib/useApi";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";

import { requestCards } from "./requests";

/** Ce que l'écran garde : la première page relue, plus les pages suivantes qu'on a chargées (oubliées à chaque relecture). */
export function useRequestList(match: (item: RequestItem) => boolean) {
  const first = useApi<RequestsPage>(() => api.requests(), []);
  const page = first.data;
  const fetchMore = useCallback((cursor: string) => api.requests(cursor), []);
  const tail = useTail<RequestItem>(page, page?.nextCursor ?? null, fetchMore, errorMessage);
  const seen = new Set<string>();
  const items = [...(page?.items ?? []), ...tail.items].filter((i) => {
    const key = `${i.kind}:${i.id}:${i.kind === "crew" ? String(i.payload.requesterId ?? "") : ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return match(i);
  });
  return {
    first,
    items,
    nextCursor: tail.nextCursor,
    more: tail.more,
    loadingMore: tail.busy,
    moreError: tail.error,
  };
}

export function RequestList({
  list,
  empty,
  onChanged,
  onInviteMenu,
}: {
  list: ReturnType<typeof useRequestList>;
  empty: string;
  /** Après une décision : l'écran relit ses compteurs et sa liste. */
  onChanged: () => void;
  /** Lot R7-fix-invite : le « ⋯ » d'une invitation de passionnés (l'écran porte la feuille). */
  onInviteMenu?: (from: { userId: string; pseudo: string }[]) => void;
}) {
  const { first, items, nextCursor, more, loadingMore, moreError } = list;
  if (first.error && !first.data) {
    return <LoadError message={first.error.message} onRetry={() => void first.reload()} />;
  }
  return (
    <View style={{ gap: 12 }} testID="request-list">
      {first.offline ? <Notice>Hors ligne : dernière liste connue.</Notice> : null}
      {items.map((item) => {
        const Card = requestCards[item.kind];
        // Une sorte que cette version de l'appli ne connaît pas n'est pas montrée (elle l'est sur le site).
        return Card ? (
          <Card
            key={`${item.kind}:${item.id}:${item.kind === "crew" ? String(item.payload.requesterId ?? "") : ""}`}
            item={item}
            onInviteMenu={onInviteMenu}
            onDone={() => {
              void first.reload();
              onChanged();
            }}
          />
        ) : null;
      })}
      {items.length === 0 ? <Muted variant="body">{first.loading ? "Chargement…" : empty}</Muted> : null}
      {moreError ? <Notice tone="error">{moreError}</Notice> : null}
      {nextCursor ? (
        <SmallButton icon="down" disabled={loadingMore} onPress={() => void more()} testID="request-more">
          Voir plus
        </SmallButton>
      ) : null}
    </View>
  );
}
