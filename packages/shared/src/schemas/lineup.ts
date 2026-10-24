import { z } from "zod";

import type { Grade } from "../grades";
import { LINEUP_PAGE_SIZE, type LineupPhase } from "../rules/lineup";

// Le plateau d'un événement (lot R4b) : `GET /events/:id/lineup`. Règles et listes blanches : `rules/lineup.ts`.

export const lineupQuerySchema = z.object({
  /** Filtre par catégorie de véhicule (slug), côté serveur. */
  category: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/)
    .optional(),
  /** Rang de départ de la page (« Voir plus »). */
  cursor: z.coerce.number().int().min(0).max(100_000).optional(),
  limit: z.coerce.number().int().min(1).max(LINEUP_PAGE_SIZE).default(LINEUP_PAGE_SIZE),
});
export type LineupQuery = z.infer<typeof lineupQuerySchema>;

/** Vignette d'une voiture vue par un visiteur sans compte (`lineupCarVisitorFields`). */
export type LineupCarPublic = {
  /** Première photo du véhicule (plaque masquée). */
  photoUrl: string | null;
  /** Nom complet (marque, modèle, génération), jamais coupé à l'affichage. */
  label: string;
  makeName: string;
  modelName: string;
  generationName: string | null;
};

/** Vignette d'une voiture vue par une personne connectée (`lineupCarMemberFields`). */
export type LineupCarMember = LineupCarPublic & {
  vehicleId: string;
  pseudo: string;
  /** Compte privé : cadenas, toucher n'ouvre que la fiche de la voiture, jamais le profil. */
  private: boolean;
  /** Ma voiture (« Toi »). */
  me: boolean;
};

export type LineupCar = LineupCarPublic | LineupCarMember;

export const isMemberCar = (c: LineupCar): c is LineupCarMember => "pseudo" in c;

/** Un pro sur place : prestataire retenu (food truck, photographe, stand) ou média accrédité. */
export type LineupPro = {
  /** Profil prestataire (`/providers/:id`) ou profil média (`/m/:id`). */
  id: string;
  kind: "provider" | "media";
  name: string;
  /** Métier : « Food truck », « Photographe », « Média »… */
  job: string;
  logoUrl: string | null;
  /** « Média officiel » : photographe accrédité par l'organisateur, ou média accrédité. */
  officialMedia: boolean;
  /** Remise Orasso du pro pour le grade de la personne connectée (`shownDiscount`), sinon `null`. */
  discount: { percent: number; from: Grade | null } | null;
};

export type EventLineup = {
  eventId: string;
  phase: LineupPhase;
  cars: LineupCar[];
  pros: LineupPro[];
  /** Voitures de la phase (toutes catégories) et pros sur place. */
  counts: { cars: number; pros: number };
  /** Voitures du filtre en cours (« Voir les N autres »). */
  filtered: number;
  /** Catégories présentes sur le plateau, pour les pastilles. */
  categories: { slug: string; label: string; count: number }[];
  /** Rang de la page suivante, `null` en fin de liste. */
  nextCursor: number | null;
};

/** La ligne « Le plateau » d'un ticket de Mes sorties : le nombre et trois mini-photos (sans requête par ticket). */
export type LineupPreview = { phase: LineupPhase; count: number; photoUrls: string[] };
