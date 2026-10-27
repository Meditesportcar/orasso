// Demandes d'abonnement reçues (lot R6b, D37 : elles remplacent les anciennes demandes) dans Boîte > Demandes : un
// compte privé accepte ou refuse (sans prévenir la personne). Tour 2 (relecture Codex 4) : 30 par page, « Voir plus »
// charge la page suivante (aucune demande cachée au-delà de 30).
import { type FollowPerson, followRequestNotificationTitle, gradeLabels, networkLabels as N } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";

import { SmButton } from "@/features/passionne/kit";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useApi } from "@/lib/useApi";
import { Notice } from "@/ui/Notice";

import { RequestCard } from "../RequestCard";
import type { RequestSectionProps } from "./types";

export function FollowRequests({ onChanged, refreshKey }: RequestSectionProps) {
  const router = useRouter();
  const requests = useApi(() => api.followRequests(), [refreshKey]);
  // Pages suivantes, rattachées à la première page lue : une relecture (décision, retour, autre compte) les oublie, et
  // une réponse arrivée pour une lecture dépassée est ignorée.
  const [extra, setExtra] = useState<{ items: FollowPerson[]; nextCursor: string | null } | null>(null);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const generation = useRef(0);
  const first = requests.data;
  // biome-ignore lint/correctness/useExhaustiveDependencies: chaque nouvelle première page oublie les suivantes
  useEffect(() => {
    generation.current += 1;
    setExtra(null);
    setMoreError(null);
  }, [first]);
  const after = () => {
    void requests.reload();
    onChanged();
  };
  const items: FollowPerson[] = [];
  const seen = new Set<string>();
  for (const p of [...(first?.items ?? []), ...(extra?.items ?? [])]) {
    if (seen.has(p.userId)) continue;
    seen.add(p.userId);
    items.push(p);
  }
  const nextCursor = extra ? extra.nextCursor : (first?.nextCursor ?? null);
  const more = async () => {
    if (!nextCursor) return;
    const mine = generation.current;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await api.followRequests(undefined, nextCursor);
      if (mine !== generation.current) return;
      setExtra((e) => ({ items: [...(e?.items ?? []), ...page.items], nextCursor: page.nextCursor }));
    } catch (e) {
      if (mine === generation.current) setMoreError(errorMessage(e));
    } finally {
      if (mine === generation.current) setLoadingMore(false);
    }
  };
  return (
    <>
      {items.map((p) => (
        <RequestCard
          key={p.userId}
          testID="request-follow"
          avatarUrl={p.avatarUrl}
          pseudo={p.pseudo}
          title={`${p.pseudo} · ${followRequestNotificationTitle}`}
          detail={p.vehicle ?? gradeLabels[p.grade]}
          onOpenProfile={() => router.push(`/u/${encodeURIComponent(p.pseudo)}`)}
          onAccept={async () => {
            await api.acceptFollow(p.userId);
            after();
          }}
          onDecline={async () => {
            await api.declineFollow(p.userId);
            after();
          }}
        />
      ))}
      {moreError ? <Notice tone="error">{moreError}</Notice> : null}
      {nextCursor && first ? (
        <SmButton
          kind="s"
          icon="down"
          wide
          disabled={loadingMore}
          onPress={() => void more()}
          testID="request-follow-more"
        >
          {`${N.more} (${Math.max(0, first.total - items.length)})`}
        </SmButton>
      ) : null}
    </>
  );
}
