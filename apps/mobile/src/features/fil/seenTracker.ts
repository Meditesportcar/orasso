// Les cartes vues du Fil (lot R8c2, maquette R8.3) : une carte visible à moitié pendant une seconde est « vue » ; une carte
// ouverte (fiche, profil, publication) ou partagée est « interagie ». La file (dédoublonnée, 200 au plus, 24 h) part par
// lots de 50 vers `POST /me/fil/seen` toutes les 10 secondes, à la sortie du Fil et au passage en arrière-plan ; un échec
// (429, réseau, serveur) remet le lot en file et repousse l'essai. Hors ligne, la file est gardée (copie du compte) et part
// au retour du réseau. Jamais une carte « Sponsorisé ». Les règles sont dans `@orasso/shared` (`createSeenQueue`).
import {
  createSeenDwell,
  createSeenQueue,
  type FeedCard,
  isSeenCardId,
  isVisibleEnough,
  SEEN_FLUSH_EVERY_MS,
  type SeenEntry,
} from "@orasso/shared";
import { useIsFocused } from "expo-router";
import { type RefObject, useCallback, useEffect, useRef } from "react";
import { AppState, type View } from "react-native";

import { api } from "@/lib/api";
import { ApiRequestError } from "@/lib/http";
import { cacheScope, onCacheScopeDropped } from "@/lib/kv";
import { readCopy, saveCopy } from "@/lib/offlineCopy";
import { useScrollAssist } from "@/ui/ScrollAssist";

const QUEUE_KEY = "fil.seen-queue";
/** Un toucher sur une carte suivi d'un départ de l'écran dans ce délai = la carte a été ouverte. */
const OPEN_WINDOW_MS = 4000;
/** La mesure de ce qui est à l'écran : deux fois par seconde (la présence se compte à la seconde). */
const MEASURE_EVERY_MS = 500;

type Store = { scope: string; queue: ReturnType<typeof createSeenQueue>; restored: boolean };
let store: Store | null = null;

/** La file du compte connecté (une par compte : un autre compte ne reprend jamais celle-ci). `null` sans compte. */
function current(): Store | null {
  const scope = cacheScope();
  if (!scope) {
    store = null;
    return null;
  }
  if (store?.scope === scope) return store;
  store = {
    scope,
    restored: false,
    queue: createSeenQueue({
      now: () => Date.now(),
      send: async (batch) => {
        // Le compte a changé pendant l'attente (A part, B arrive) : rien ne part avec le jeton de B.
        if (cacheScope() !== scope) return "retry";
        try {
          await api.feedSeen(batch);
          return "ok";
        } catch (e) {
          // 400 : un lot que l'API ne lira jamais, il est abandonné. 429, réseau, serveur : il reste en file.
          return e instanceof ApiRequestError && e.status === 400 ? "drop" : "retry";
        }
      },
    }),
  };
  return store;
}

/** La garde d'une file : le compte d'origine, capturé à sa création ; faux dès qu'un autre compte est lié. */
const guardOf = (s: Store) => ({ scope: s.scope, current: () => cacheScope() === s.scope });

// Déconnexion ou changement de compte : la file de l'ancien compte est invalidée (rien ne part, rien ne s'écrit sous un autre).
onCacheScopeDropped(async () => {
  store = null;
  written = null;
});

/** La file gardée sur le téléphone est reprise une fois (redémarrage de l'appli en cours de lecture hors ligne). */
async function restore(s: Store): Promise<void> {
  if (s.restored) return;
  s.restored = true;
  // Lue sous le compte de cette file, jamais sous celui qui est lié maintenant.
  const saved = await readCopy<SeenEntry[]>(QUEUE_KEY, guardOf(s));
  if (saved && cacheScope() === s.scope && Array.isArray(saved.value)) {
    written = { scope: s.scope, key: JSON.stringify(saved.value) };
    s.queue.restore(saved.value);
  }
}

/** Retient une carte vue (`view`), ouverte (`open`) ou partagée (`share`). */
export function noteSeen(id: string, action: "view" | "open" | "share"): void {
  if (!isSeenCardId(id)) return;
  current()?.queue.add(id, action);
}

/** Envoie ce qui est en file (rien si on attend un nouvel essai) ; ce qui reste est gardé sur le téléphone. */
export async function flushSeen(): Promise<void> {
  const s = current();
  if (!s) return;
  await restore(s);
  // Gardée avant l'attente réseau : un arrêt de l'appli pendant l'envoi ne perd rien (le lot en vol reste dans l'état gardé).
  await persist(s, false);
  const done = await s.queue.flush();
  await persist(s, done);
}

/** Dernière file écrite sur le téléphone, par compte : on n'écrit que ce qui a changé. */
let written: { scope: string; key: string } | null = null;

async function persist(s: Store, done: boolean): Promise<void> {
  const left = s.queue.snapshot();
  const key = JSON.stringify(done && left.length === 0 ? [] : left);
  if (written?.scope === s.scope && written.key === key) return;
  // Écrit sous le compte de cette file, jamais sous celui qui est lié maintenant.
  await saveCopy(QUEUE_KEY, JSON.parse(key), new Date(), guardOf(s));
  written = { scope: s.scope, key };
}

/** Les cartes qu'on suit : jamais ma propre publication, jamais une carte déjà vue, jamais une forme d'identifiant inconnue. */
export const isTrackable = (card: FeedCard): boolean =>
  isSeenCardId(card.id) && !card.seen && !(card.kind === "feed_post" && card.payload.post.mine);

type Layout = { y: number; h: number };

/** Un vrai toucher : le doigt a bougé de moins de 10 px (un défilement n'ouvre aucune carte). */
export const isRealTap = (from: { x: number; y: number }, to: { x: number; y: number }): boolean =>
  Math.hypot(to.x - from.x, to.y - from.y) < 10;

/**
 * Suit les cartes de la liste : toutes les 500 ms (Fil affiché, application active), mesure la liste et les cartes à l'écran,
 * compte une seconde de présence, puis retient la carte. Envoie toutes les 10 s, à la sortie du Fil, au passage en arrière-plan
 * et au retour du réseau. Un toucher puis la sortie du Fil = la carte a été ouverte.
 *
 * `list` : la vue qui contient les cartes ; `layouts` : la place de chaque carte dans cette vue (`onLayout`) ; `reset` : un
 * numéro qui change quand la liste est remplacée (autre onglet, actualisation) et repart la mesure de présence.
 */
export function useSeenTracker(opts: {
  list: RefObject<View | null>;
  layouts: RefObject<Map<string, Layout>>;
  cards: readonly FeedCard[];
  reset: unknown;
  online: boolean;
}) {
  const { list, layouts, cards, reset, online } = opts;
  const assist = useScrollAssist();
  const focused = useIsFocused();
  const dwell = useRef(createSeenDwell());
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const touched = useRef<{ id: string; at: number } | null>(null);

  // Une autre liste : la présence repart de zéro.
  // biome-ignore lint/correctness/useExhaustiveDependencies: seul le changement de liste relance la mesure.
  useEffect(() => {
    dwell.current = createSeenDwell();
  }, [reset]);

  /** Appelé à la fin d'un vrai toucher sur une carte (déplacement de moins de 10 px : un défilement n'ouvre rien). */
  const touch = useCallback((id: string) => {
    touched.current = { id, at: Date.now() };
  }, []);

  useEffect(() => {
    if (!focused) return;
    const measure = () => {
      const box = list.current;
      if (!box || !assist || AppState.currentState !== "active") return;
      assist.visibleArea((areaTop, areaBottom) => {
        box.measureInWindow((_x, top) => {
          const visible: string[] = [];
          for (const card of cardsRef.current) {
            if (!isTrackable(card)) continue;
            const l = layouts.current?.get(card.id);
            if (l && isVisibleEnough(top + l.y, l.h, areaTop, areaBottom)) visible.push(card.id);
          }
          for (const id of dwell.current.observe(visible, Date.now())) noteSeen(id, "view");
        });
      });
    };
    const measuring = setInterval(measure, MEASURE_EVERY_MS);
    const sending = setInterval(() => void flushSeen(), SEEN_FLUSH_EVERY_MS);
    const state = AppState.addEventListener("change", (s) => {
      if (s !== "active") void flushSeen();
    });
    return () => {
      clearInterval(measuring);
      clearInterval(sending);
      state.remove();
      // Quitter le Fil juste après un toucher sur une carte : elle a été ouverte (fiche, profil, publication…).
      const last = touched.current;
      touched.current = null;
      if (last && Date.now() - last.at < OPEN_WINDOW_MS) noteSeen(last.id, "open");
      void flushSeen();
    };
  }, [focused, assist, list, layouts]);

  // Retour du réseau : ce qui a été vu hors ligne part.
  const wasOnline = useRef(online);
  useEffect(() => {
    if (online && !wasOnline.current) void flushSeen();
    wasOnline.current = online;
  }, [online]);

  return { touch };
}
