// Les données d'un vote et de la liste des votes (lot R7l3) : lectures de l'API des votes à thème (R7l1), mises à jour par le
// canal `event:{id}:votes` (un message dit seulement « quelque chose a changé » : le classement n'y est plus, chaque client
// le relit par la route, qui applique la règle de visibilité), relectures limitées (au moins 10 s entre deux, puis regroupées :
// `createVoteReloader`, la grille des candidats seulement sur les messages qui la changent : charge du serveur le jour J) et
// surveillance de la clôture.
import {
  collectPages,
  createVoteReloader,
  type VoteCandidate,
  type VoteList,
  type VoteView,
  voteIsOver,
  voteWatchDeadline,
  watchClosing,
} from "@orasso/shared";
import { useIsFocused } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { api } from "@/lib/api";
import { useApplications } from "@/lib/applications";
import { serverNow } from "@/lib/clock";
import { useChannel } from "@/lib/realtime";
import { useApi } from "@/lib/useApi";

import { createLatestRead } from "./latestRead";

/** Les messages du canal qui changent ce que montre un écran de vote (`VotesChangedMessage`, R7l1 tours 2 et 3). */
const VOTE_MESSAGES = new Set([
  "votes.changed",
  "theme_votes.changed",
  "votes.opened",
  "votes.closed",
  "votes.candidates.changed",
]);

/** Un message concerne-t-il ce vote ? Sans `voteId` (ancien format), il concerne tout le monde. */
export function messageConcerns(payload: unknown, voteId: string | null): boolean {
  const id = (payload as { voteId?: unknown } | null)?.voteId;
  return voteId === null || typeof id !== "string" || id === voteId;
}

/**
 * Relectures limitées sur un message du canal (au moins 10 s entre deux, grille seulement quand le message la change), et au
 * retour au premier plan ou à la reconnexion (des messages ont pu être manqués : même délai minimal, grille comprise ; la
 * reconnexion garde la gigue, le premier plan non : tour 4).
 */
function useVoteChannel(
  eventId: string | null,
  voteId: string | null,
  reload: (withGrid: boolean) => Promise<unknown>,
) {
  const focused = useIsFocused();
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const reloader = useRef(createVoteReloader((withGrid) => reloadRef.current(withGrid))).current;
  // Le premier abonnement ne relit pas (la lecture du montage est partie) ; une reconnexion relit (messages manqués).
  const subscribedOnce = useRef(false);
  useChannel(
    focused && eventId ? `event:${eventId}:votes` : null,
    (message) => {
      if (VOTE_MESSAGES.has(message.type) && messageConcerns(message.payload, voteId))
        reloader.message(message.type).catch(() => undefined); // l'échec est gardé par le relecteur (grille à relire)
    },
    () => {
      if (subscribedOnce.current) reloader.reconnect().catch(() => undefined);
      subscribedOnce.current = true;
    },
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") reloader.refresh().catch(() => undefined);
    });
    return () => {
      sub.remove();
      reloader.cancel(); // plus de minuterie après le démontage (tour 4)
    };
  }, [reloader]);
}

/** La liste des votes d'un événement (ligne par vote, mon droit, mon vote, podium des clos). */
export function useVotesList(eventId: string | null) {
  const list = useApi<VoteList>(() => api.voteList(eventId as string), [eventId], {
    enabled: Boolean(eventId),
    refreshMs: 60_000,
  });
  // La liste n'a pas de grille : chaque message utile la relit, au plus une fois toutes les 10 s ; `reload` reste direct.
  useVoteChannel(eventId, null, () => list.reload());
  return list;
}

/**
 * Toutes les pages de la grille d'un vote (100 par page, ordre stable de l'API), sans plafond de 5 000 candidats. Une page qui
 * échoue ou une pagination qui ne finit pas est une **erreur** (l'écran dit l'échec et propose « Réessayer ») : jamais une
 * grille tronquée ou vide présentée comme complète (tour 2).
 */
export async function loadGrid(eventId: string, voteId: string): Promise<VoteCandidate[]> {
  const r = await collectPages((cursor) => api.voteCandidates(eventId, voteId, cursor));
  if (!r.complete) throw new Error("grid_incomplete");
  return r.items;
}

/**
 * Un vote : le détail (avec le classement quand l'API le sert), la grille des candidats, les relectures du canal, et la
 * surveillance de la clôture **tant que le vote n'est pas fini**, qu'il soit ouvert ou pas encore (constat du 09/11 : un écran
 * ouvert avant l'ouverture armait sa minuterie sur `open` seulement ; un vote qui s'ouvre ensuite ne la réarmait jamais).
 */
export function useVote(eventId: string | null, voteId: string | null) {
  const enabled = Boolean(eventId && voteId);
  const view = useApi<VoteView>(() => api.voteGet(eventId as string, voteId as string), [eventId, voteId], {
    enabled,
    refreshMs: 60_000,
  });
  // `useApi.reload` ne rejette jamais : l'échec de la dernière lecture de la grille est noté ici pour que le relecteur du canal
  // la garde « à relire » (tour 3). Le résultat suit la lecture acceptée par `useApi` (la dernière partie) : une ancienne
  // réponse arrivée après ne le modifie pas (tour 4).
  const gridRead = useRef(createLatestRead()).current;
  const grid = useApi<VoteCandidate[]>(
    async () => {
      const read = gridRead.start();
      try {
        const items = await loadGrid(eventId as string, voteId as string);
        read.settle(true);
        return items;
      } catch (error) {
        read.settle(false);
        throw error;
      }
    },
    [eventId, voteId],
    { enabled },
  );
  // Les rechargeurs changent à chaque rendu : les minuteries lisent toujours le dernier.
  const reloadAll = useRef<() => Promise<boolean>>(async () => false);
  reloadAll.current = async () => {
    const [fresh] = await Promise.all([view.reload(), grid.reload()]);
    return voteIsOver(fresh);
  };
  // Le canal relit le détail (classement compris) ; la grille seulement quand les candidats changent (ouverture, clôture…).
  // Tour 5 : la grille est relue si le message la change **ou** si elle est restée « à relire » (lecture en échec, même
  // croisée avec une autre) ; tant qu'aucune lecture partie après n'a réussi, l'erreur garde la grille à relire.
  useVoteChannel(eventId, voteId, async (withGrid) => {
    if (withGrid) gridRead.invalidate();
    const withGridNow = gridRead.failed();
    await Promise.all([view.reload(), withGridNow ? grid.reload() : null]);
    if (withGridNow && gridRead.failed()) throw new Error("grid_reload_failed"); // la grille reste à relire
  });
  // Le geste de l'utilisateur (« Réessayer ») relit tout, tout de suite.
  const reload = () => reloadAll.current();

  // Surveillance de la clôture : à l'échéance **du serveur**, relit puis réessaie (2, 4, 8, 15, 30, 60 s) jusqu'à ce que
  // l'API dise « clos » ou « réglé ». L'échéance vient de `closesAt` de la dernière réponse ; elle change quand le vote
  // s'ouvre (début + durée) : l'effet se réarme alors tout seul.
  const closing = useRef<ReturnType<typeof watchClosing> | null>(null);
  const deadline = voteWatchDeadline(view.data);
  const deadlineMs = deadline ? deadline.getTime() : null;
  useEffect(() => {
    if (deadlineMs === null) return undefined;
    const watch = watchClosing({
      deadline: new Date(deadlineMs),
      now: serverNow,
      reload: () => reloadAll.current(),
    });
    closing.current = watch;
    return () => {
      watch.stop();
      if (closing.current === watch) closing.current = null;
    };
  }, [deadlineMs]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: chaque réponse reçue est l'occasion de revoir l'heure du serveur
  useEffect(() => closing.current?.check(), [view.data]);

  return { view, grid, reload };
}

/** L'événement d'un lien : un identifiant, ou l'adresse (`/votes/<adresse>` d'une notification). Résolu une seule fois. */
export function useEventRef(ref: string | undefined): {
  eventId: string | null;
  title: string | null;
  slug: string | null;
  error: boolean;
  /** Relit l'événement (adresse d'une notification ouverte hors ligne) : « Réessayer » commence par là. */
  reload: () => Promise<unknown>;
} {
  const { upcoming, past } = useApplications();
  const isId = Boolean(ref && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref));
  const resolved = useApi(() => api.eventBySlug(ref as string), [ref], { enabled: Boolean(ref) && !isId });
  const [stable, setStable] = useState<{ id: string; title: string; slug: string } | null>(null);
  useEffect(() => {
    if (resolved.data) setStable({ id: resolved.data.id, title: resolved.data.title, slug: resolved.data.slug });
  }, [resolved.data]);
  // Un identifiant sans titre dans l'adresse : le titre vient des candidatures déjà lues (comme l'ancien écran du vote).
  const known = [...(upcoming ?? []), ...(past ?? [])].find((a) => a.event.id === ref)?.event;
  if (isId)
    return {
      eventId: ref as string,
      title: known?.title ?? null,
      slug: known?.slug ?? null,
      error: false,
      reload: async () => null,
    };
  return {
    eventId: stable?.id ?? null,
    title: stable?.title ?? null,
    slug: stable?.slug ?? null,
    error: Boolean(resolved.error) && !stable,
    reload: () => resolved.reload(),
  };
}
