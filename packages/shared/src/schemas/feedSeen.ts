import { z } from "zod";

import { feedCardKinds, feedFilters } from "../rules/feed";

// Cartes vues du Fil et nouveautés (lot R8c1) : `POST /me/fil/seen`, `GET /fil/fresh`.

/** Cartes par envoi de `POST /me/fil/seen`. */
export const FEED_SEEN_BATCH_MAX = 50;
/**
 * Heure de l'appareil (`at`) d'une carte vue hors ligne : acceptée jusqu'à 24 h en arrière, au-delà ramenée à cette borne. Elle ne
 * date pas la vue : l'API date à la réception (le parcours en cours reste figé).
 */
export const FEED_SEEN_AT_MAX_AGE_MS = 24 * 3_600_000;
/**
 * Durée de vie d'une carte vue (30 jours), **et** âge au-delà duquel une carte du Fil n'est plus « pas vue » : plus ancienne que
 * `ref` − 30 jours, elle est rangée en zone B (`seen: true`) même sans ligne `feed_seen`. Sans cette borne, la purge ferait
 * revenir tout l'historique en haut du Fil. Une seule constante pour la purge et pour la zone.
 */
export const FEED_SEEN_TTL_MS = 30 * 86_400_000;
/** File d'attente gardée sur le téléphone hors ligne (R8c2). */
export const FEED_SEEN_QUEUE_MAX = 200;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Genres dont on retient qu'ils ont été vus : tous ceux du Fil sauf « Sponsorisé » (il se compte autrement, jamais ici). */
export const feedSeenKinds = feedCardKinds.filter((k) => k !== "sponsored");

/** Identifiant de carte du Fil : `genre:uuid`, d'un genre qui se retient ; l'uuid est mis en minuscules. */
const seenCardId = z
  .string()
  .max(80)
  .transform((v) => v.toLowerCase())
  .refine((v) => {
    const sep = v.indexOf(":");
    return sep > 0 && (feedSeenKinds as readonly string[]).includes(v.slice(0, sep)) && UUID.test(v.slice(sep + 1));
  }, "Carte inconnue");

export const feedSeenActions = ["view", "open", "share"] as const;
export type FeedSeenAction = (typeof feedSeenActions)[number];

/** `POST /me/fil/seen` : 50 cartes au plus ; `at` (ISO) est ramené entre maintenant − 24 h et maintenant par l'API. */
export const feedSeenSchema = z.object({
  cards: z
    .array(
      z.object({
        id: seenCardId,
        action: z.enum(feedSeenActions),
        at: z.iso.datetime({ offset: true }).optional(),
      }),
    )
    .min(1)
    .max(FEED_SEEN_BATCH_MAX),
});
export type FeedSeenBody = z.infer<typeof feedSeenSchema>;

/** `GET /fil/fresh?filter=&since=` : `since` = le `ref` de la page que l'écran affiche. */
export const feedFreshQuery = z.object({
  filter: z.enum(feedFilters).default("for_you"),
  since: z.iso.datetime({ offset: true }),
});
export type FeedFresh = { count: number };
