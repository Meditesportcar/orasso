// Passeport, prix du public, récap (lot 49, ARCHITECTURE-DA-V2 § 5.5) : entrées et vues de l'API.
import { z } from "zod";

import type { EventFormat } from "../enums";
import type { Grade } from "../grades";
import type { PointKind } from "../rules/points";
import type { StampInk, StampKind, StampShape } from "../rules/stamps";

// --- Passeport ---------------------------------------------------------------------------------------------------

/** `GET /me/passport?season=2026` (année de la saison ; absente = saison en cours). */
export const passportQuerySchema = z.object({
  season: z.coerce.number().int().min(2000).max(2100).optional(),
});

/** Un tampon : le client le dessine (forme, encre, usure tirée de `seed`, dorure si `rare`). */
export type PassportStamp = {
  id: string;
  kind: StampKind;
  shape: StampShape;
  ink: StampInk;
  /** Aléa 0–9999 : angle, pression, bavure (`stampWear`). */
  seed: number;
  rare: boolean;
  stampedAt: string;
  event: {
    id: string;
    slug: string;
    title: string;
    format: EventFormat;
    startsAt: string;
    city: string | null;
    department: string | null;
  };
};

export type PassportSeason = { year: number; name: string; total: number };

export type PassportView = {
  season: PassportSeason;
  /** Saisons où il y a des tampons, et la saison en cours ; la plus récente d'abord. */
  seasons: PassportSeason[];
  /** Pages de 8 tampons, du plus ancien au plus récent (une page vide s'il n'y en a aucun). */
  pages: { stamps: PassportStamp[] }[];
  total: number;
  rare: number;
};

/** Canal `user:{id}`, événement `passport.stamped` : le tampon tombe à l'écran au scan. */
export type PassportStampedEvent = PassportStamp;

// --- Prix du public ----------------------------------------------------------------------------------------------

/** `PUT /events/:id/audience-prize/vote` : une voix, modifiable jusqu'à la clôture. */
export const audienceVoteSchema = z.object({ applicationId: z.uuid() });
export type AudienceVoteInput = z.infer<typeof audienceVoteSchema>;

export type AudiencePrizeEntry = {
  applicationId: string;
  vehicleLabel: string;
  pseudo: string;
  photoUrl: string | null;
  votes: number;
  rank: number;
};

/** `GET /events/:id/audience-prize` : classement en direct (pendant le vote) ou résultats (après le règlement). */
export type AudiencePrizeBoard = {
  eventId: string;
  open: boolean;
  /** Fin de l'événement. */
  closesAt: string;
  /** Résultats figés au règlement (top 10) ; avant, classement calculé en direct. */
  settled: boolean;
  total: number;
  /** Véhicules pointés (« 4e sur 142 »). */
  vehicles: number;
  /** Points du gagnant (réglage de l'administration, 50 par défaut). */
  winnerPoints: number;
  entries: AudiencePrizeEntry[];
  /** Après le règlement : le gagnant, ou `null` si le prix n'a pas été décerné (moins de 2 véhicules ou 3 voix). */
  winner: AudiencePrizeEntry | null;
};

/** `GET /events/:id/audience-prize/mine`. */
export type AudiencePrizeMine = {
  canVote: boolean;
  /** Pourquoi pas (`vote_closed`, `vote_not_open`, `not_checked_in`), `null` si le vote est possible. */
  reason: "vote_closed" | "vote_not_open" | "not_checked_in" | null;
  open: boolean;
  closesAt: string;
  /** « Pointage à 19 h 02 » (ou heure du billet scanné). */
  checkedInAt: string | null;
  votedFor: string | null;
  votedAt: string | null;
  /** Ses propres candidatures : pas de voix pour elles. */
  ownApplicationIds: string[];
};

/** Canal `event:{id}:votes`, événement `votes.changed` ; `votes.candidates.changed` invalide la grille (payload vide). */
export type AudienceVotesChanged = { total: number; top3: { applicationId: string; votes: number; rank: number }[] };

// --- Récap -------------------------------------------------------------------------------------------------------

export type RecapPointLine = { kind: PointKind; points: number; label: string };

/** `GET /me/recaps/:eventId` : calculé à la demande, jamais stocké (V8). */
export type RecapView = {
  event: {
    id: string;
    slug: string;
    title: string;
    format: EventFormat;
    startsAt: string;
    endsAt: string;
    city: string | null;
    department: string | null;
  };
  /** Véhicules pointés. */
  vehiclesCount: number;
  /** Mon entrée (pointage d'un de mes véhicules, sinon billet scanné). */
  myArrival: string | null;
  /** Minutes de l'entrée à la fin de l'événement (plafonnées à la durée de l'événement). */
  myDuration: number | null;
  /** Mon meilleur rang au prix du public (`null` sans véhicule pointé ou sans aucune voix). */
  audienceRank: { rank: number; of: number; votes: number; winner: boolean } | null;
  /** Projetés à J+1 (avant le règlement), acquis après le règlement de J+2 : le même écran se met à jour. */
  points: { status: "projected" | "settled"; total: number; detail: RecapPointLine[] };
  /** Points qui restent avant le grade suivant (après les points du récap). */
  nextGradeIn: { grade: Grade; points: number } | null;
  /** Mon tampon de l'événement (le rare le plus récent s'il y en a un), et la phrase du récap. */
  stamp: (PassportStamp & { sentence: string }) | null;
  /** Fin de la fenêtre des avis (fin de l'événement + 7 jours). */
  reviewDeadline: string;
  /** Candidature à noter (feuille d'avis existante), `null` si rien à noter ou avis déjà donné. */
  reviewApplicationId: string | null;
  shareText: string;
  /** Album des photographes : plus tard (idée 8). */
  photos: never[];
};

export type RecapListItem = {
  eventId: string;
  slug: string;
  title: string;
  format: EventFormat;
  startsAt: string;
  endsAt: string;
  /** Récap disponible à partir de J+1 10 h. */
  readyAt: string;
};

/** `GET /events/:id/audience-prize/candidates?cursor=` : tous les véhicules pointés, sans les voix (la grille du vote). */
export const audienceCandidatesQuery = z.object({ cursor: z.coerce.number().int().min(0).max(100_000).default(0) });

export type AudienceCandidate = Pick<AudiencePrizeEntry, "applicationId" | "vehicleLabel" | "pseudo" | "photoUrl">;

export type AudienceCandidates = { items: AudienceCandidate[]; next: number | null };
