// Le direct (lot R7d1, ARCHITECTURE-R7 § 2.3) : entrées et vues de l'API. Rien de ce fichier ne porte une position
// gardée : `lat` et `lng` n'existent que dans la demande de présence, jamais dans une réponse ni dans une table.
import { z } from "zod";

import type { LivePhase, MyPresence } from "../rules/presence";

/**
 * `POST /events/:id/presence` : la position de l'appareil, vérifiée une fois puis oubliée. `accuracyM` : la précision
 * annoncée par l'appareil, en mètres (facultative ; absente ou `null`, que certains appareils renvoient, = aucune tolérance). Corps strict : un champ en plus est
 * refusé, pour qu'aucune donnée ne passe en douce par cette route.
 */
export const presenceInputSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracyM: z.number().min(0).max(100_000).nullish(),
  })
  .strict();
export type PresenceInput = z.infer<typeof presenceInputSchema>;

/** Réponse : l'heure de validation, le tampon posé (`null` s'il l'était déjà), le droit de vote (la règle effective du vote : il
 * faut aussi deux véhicules pointés et la fenêtre ouverte). */
export type PresenceResult = { validatedAt: string; stampId: string | null; canVote: boolean };

/** `GET /events/:id/presences/summary` : des nombres, jamais une liste, jamais un nom de non-inscrit. */
export type PresenceSummary = {
  /** Exposants (véhicules) entrés par le pointage. */
  exhibitorsCheckedIn: number;
  /** Visiteurs avec une place, présents par GPS. */
  visitorsWithTicketGps: number;
  /** Visiteurs sans place, présents par GPS. */
  visitorsNoTicketGps: number;
  /** Utilisateurs d'Orasso présents : entrées scannées, billets contrôlés et présences GPS. */
  total: number;
};

/**
 * Bloc `live` de la fiche d'un événement (`GET /events/:id` et `/events/by-slug/:slug`). `onSiteCount` et
 * `acceptedCount` sont nuls hors de l'événement (règle des absents).
 */
export type EventLive = {
  phase: LivePhase;
  /** « Jour 2 sur 4 » (1 sur 1 pour un événement d'un jour). */
  dayIndex: number;
  dayCount: number;
  onSiteCount: number | null;
  acceptedCount: number | null;
  /** Connecté seulement : comment je suis sur place, `null` sinon. */
  myPresence: MyPresence | null;
  /**
   * « Je suis sur place » est proposable : l'API ne refuserait pas avant la mesure (ouvert, pas de place de véhicule,
   * accès et billet, pas déjà présent). Calculé par la même règle que la validation (`presenceGate`) ; faux sans
   * connexion. L'écran lit ce booléen, il ne devine rien.
   */
  canValidatePresence: boolean;
  /** Votes ouverts maintenant (0 ou 1 aujourd'hui : le prix du public ; R7l1 y branche les votes à thème). */
  votesOpen: number;
  /** Story « En cours » de l'organisateur (R7h) ; faux tant qu'elle n'existe pas. */
  organizerStoryAvailable: boolean;
};

/** Widget `live` de `GET /me/home` : l'événement en cours où j'ai une place ou une présence. */
export type HomeLive = {
  event: {
    id: string;
    slug: string;
    title: string;
    startsAt: string;
    endsAt: string;
    city: string | null;
    posterUrl: string | null;
    structure: { name: string; logoUrl: string | null };
  };
  dayIndex: number;
  dayCount: number;
  /** Une place retenue ou un billet pour cet événement : sans elle (présence seule), pas de « Mon accès ». */
  hasPlace: boolean;
  onSiteCount: number | null;
  /** `canVote` : le droit personnel de voter maintenant (calculé par la règle des votes, jamais déduit de `open`). */
  votes: { open: number; voted: number; canVote: boolean };
  /** Horaires du jour et consignes (aux retenus seulement) ; ce qui existe, rien d'inventé. */
  programToday: { dayDate: string; startsAt: string; endsAt: string; instructions: string | null } | null;
  /**
   * Story de l'organisateur « En cours » (R7h) : la clé de l'auteur (`s:<structure>`) et l'image de sa dernière story
   * (route protégée), `null` s'il n'a pas de story vivante.
   */
  organizerStory: { structureKey: string; posterUrl: string | null } | null;
};
