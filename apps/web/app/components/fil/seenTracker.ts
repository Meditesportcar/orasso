// Les cartes vues du Fil sur le site (lot R8c2, mêmes règles que l'appli : `@orasso/shared`). Une carte visible à moitié
// pendant une seconde est « vue » (`IntersectionObserver`) ; une carte ouverte ou partagée est « interagie ». La file part par
// lots de 50 vers `POST /me/fil/seen` toutes les 10 secondes, quand l'onglet se cache ou se ferme ; un échec remet le lot en
// file (429 : pas de boucle serrée). Jamais une carte « Sponsorisé ». Le site n'a pas de mode hors ligne : la file reste en
// mémoire de l'onglet.
import {
  createSeenDwell,
  createSeenQueue,
  type FeedCard,
  isSeenCardId,
  SEEN_FLUSH_EVERY_MS,
  SEEN_VISIBLE_SHARE,
} from "@orasso/shared";
import { type RefObject, useEffect, useRef } from "react";

import { apiFetch } from "../../lib/api.client";

const MEASURE_EVERY_MS = 500;

type Store = { userId: string; queue: ReturnType<typeof createSeenQueue> };
let store: Store | null = null;

/** La file de l'onglet pour ce compte (une autre personne sur le même onglet ne reprend jamais celle-ci). */
function queueFor(userId: string): Store["queue"] {
  if (store?.userId === userId) return store.queue;
  const queue: Store["queue"] = createSeenQueue({
    now: () => Date.now(),
    send: async (batch) => {
      // Cette file n'est plus celle du module (déconnexion, autre compte) : rien ne part avec la session d'un autre.
      if (store?.queue !== queue) return "retry";
      const res = await apiFetch("/me/fil/seen", { method: "POST", json: { cards: batch }, keepalive: true });
      if (res.ok) return "ok";
      return res.status === 400 ? "drop" : "retry";
    },
  });
  store = { userId, queue };
  return queue;
}

/** Envoie la file de ce compte (rien si ce n'est plus la file de l'onglet). */
export function flushSeenActions(userId: string): Promise<boolean> {
  return store?.userId === userId ? store.queue.flush() : Promise.resolve(true);
}

/** Déconnexion : la file du compte part avec lui (aucun lot suivant ne part avec la session du compte d'après). */
export function resetSeen(): void {
  store = null;
}

/** Retient une carte ouverte (`open`) ou partagée (`share`). */
export function noteSeenAction(userId: string, id: string, action: "view" | "open" | "share"): void {
  if (isSeenCardId(id)) queueFor(userId).add(id, action);
}

/** Les cartes qu'on suit : jamais ma propre publication, jamais une carte déjà vue. */
export const isTrackable = (card: FeedCard): boolean =>
  isSeenCardId(card.id) && !card.seen && !(card.kind === "feed_post" && card.payload.post.mine);

/**
 * Suit les cartes de `root` portant `data-seen-id` : visibles à moitié (ou la moitié de l'écran pour une carte plus haute),
 * une seconde d'affilée, onglet affiché. `reset` : un numéro qui change quand la liste est remplacée.
 */
export function useSeenObserver(opts: {
  userId: string;
  root: RefObject<HTMLElement | null>;
  cards: readonly FeedCard[];
  reset: unknown;
}) {
  const { userId, root, cards, reset } = opts;
  const dwell = useRef(createSeenDwell());
  const visible = useRef(new Set<string>());

  // Une autre liste : la présence repart de zéro.
  // biome-ignore lint/correctness/useExhaustiveDependencies: seul le changement de liste relance la mesure.
  useEffect(() => {
    dwell.current = createSeenDwell();
    visible.current = new Set();
  }, [reset]);

  // Les cartes à suivre changent : on réobserve.
  const key = cards
    .filter(isTrackable)
    .map((c) => c.id)
    .join("|");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` résume les cartes suivies.
  useEffect(() => {
    const box = root.current;
    if (!box || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.seenId;
          if (!id) continue;
          // Une carte plus haute que la moitié de l'écran compte quand la moitié de l'écran en est couverte.
          const enough =
            entry.intersectionRatio >= SEEN_VISIBLE_SHARE ||
            entry.intersectionRect.height >= SEEN_VISIBLE_SHARE * window.innerHeight;
          if (enough && entry.isIntersecting) visible.current.add(id);
          else visible.current.delete(id);
        }
      },
      { threshold: [0, 0.25, SEEN_VISIBLE_SHARE, 0.75, 1] },
    );
    for (const el of box.querySelectorAll<HTMLElement>("[data-seen-id]")) observer.observe(el);
    return () => {
      observer.disconnect();
      visible.current = new Set();
    };
  }, [root, key]);

  useEffect(() => {
    const queue = queueFor(userId);
    const measuring = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      for (const id of dwell.current.observe([...visible.current], Date.now())) queue.add(id, "view");
    }, MEASURE_EVERY_MS);
    const sending = window.setInterval(() => void queue.flush(), SEEN_FLUSH_EVERY_MS);
    const hide = () => {
      if (document.visibilityState === "hidden") void queue.flush();
    };
    const leave = () => void queue.flush();
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", leave);
    return () => {
      window.clearInterval(measuring);
      window.clearInterval(sending);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", leave);
      void queue.flush();
    };
  }, [userId]);
}
