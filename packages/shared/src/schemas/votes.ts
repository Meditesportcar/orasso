// Votes à thème (lot R7l1, ARCHITECTURE-R7 § 2.7) : entrées et vues de l'API. Les règles (état, droits, classement,
// points) sont dans `rules/votes.ts`.
import { z } from "zod";

import {
  type RankingHiddenReason,
  VOTE_DURATION_MAX,
  VOTE_DURATION_MIN,
  VOTE_TITLE_MAX,
  VOTE_TITLE_MIN,
  type VoteCandidateFilter,
  type VoteCandidateMode,
  type VoteCandidateSource,
  type VoteKind,
  type VoteOpenMode,
  type VoteState,
  voteCandidateModes,
  voteOpenModes,
} from "../rules/votes";

const isoCountry = z.string().regex(/^[A-Z]{2}$/, "Code pays à deux lettres (JP, DE…)");

export const voteCandidateFilterSchema = z
  .object({
    countries: z.array(isoCountry).min(1).max(30).optional(),
    makeIds: z.array(z.uuid()).min(1).max(30).optional(),
    zoneId: z.uuid().optional(),
  })
  .strict();

const titleSchema = z.string().trim().min(VOTE_TITLE_MIN, "Donne un titre au vote").max(VOTE_TITLE_MAX);
const durationSchema = z.number().int().min(VOTE_DURATION_MIN).max(VOTE_DURATION_MAX);

/** Cohérence du mode des candidats, du filtre et de l'ouverture (commune à la création et à la modification). */
export function checkVoteFields(
  v: {
    candidateMode?: VoteCandidateMode;
    candidateFilter?: VoteCandidateFilter | null;
    openMode?: VoteOpenMode;
    opensAt?: Date | null;
  },
  ctx: z.RefinementCtx,
) {
  const f = v.candidateFilter ?? null;
  if (v.candidateMode === "origins" && !(f?.countries?.length || f?.makeIds?.length)) {
    ctx.addIssue({ code: "custom", path: ["candidateFilter"], message: "Choisis au moins un pays ou une marque" });
  }
  if (v.candidateMode === "zone" && !f?.zoneId) {
    ctx.addIssue({ code: "custom", path: ["candidateFilter"], message: "Choisis une zone" });
  }
  if ((v.candidateMode === "all" || v.candidateMode === "hand") && f) {
    ctx.addIssue({ code: "custom", path: ["candidateFilter"], message: "Pas de filtre pour ce mode" });
  }
  if (v.candidateMode === "origins" && f?.zoneId) {
    ctx.addIssue({ code: "custom", path: ["candidateFilter"], message: "Une zone ne va pas avec une origine" });
  }
  if (v.candidateMode === "zone" && (f?.countries || f?.makeIds)) {
    ctx.addIssue({ code: "custom", path: ["candidateFilter"], message: "Une origine ne va pas avec une zone" });
  }
  if (v.openMode === "at" && !v.opensAt) {
    ctx.addIssue({ code: "custom", path: ["opensAt"], message: "Indique l'heure d'ouverture" });
  }
  if (v.openMode && v.openMode !== "at" && v.opensAt) {
    ctx.addIssue({ code: "custom", path: ["opensAt"], message: "Pas d'heure pour ce mode d'ouverture" });
  }
}

/** `POST /events/:id/votes`. */
export const voteCreateSchema = z
  .object({
    title: titleSchema,
    candidateMode: z.enum(voteCandidateModes),
    candidateFilter: voteCandidateFilterSchema.nullish().transform((f) => f ?? null),
    openMode: z.enum(voteOpenModes),
    opensAt: z.coerce
      .date()
      .nullish()
      .transform((d) => d ?? null),
    durationMinutes: durationSchema.nullish().transform((d) => d ?? null),
  })
  .strict()
  .superRefine(checkVoteFields);
export type VoteCreate = z.infer<typeof voteCreateSchema>;

/** `PATCH /events/:id/votes/:voteId` : seulement avant l'ouverture ; la cohérence est revérifiée sur le vote fusionné. */
export const voteUpdateSchema = z
  .object({
    title: titleSchema.optional(),
    candidateMode: z.enum(voteCandidateModes).optional(),
    candidateFilter: voteCandidateFilterSchema.nullish(),
    openMode: z.enum(voteOpenModes).optional(),
    opensAt: z.coerce.date().nullish(),
    durationMinutes: durationSchema.nullish(),
  })
  .strict();
export type VoteUpdate = z.infer<typeof voteUpdateSchema>;

/** `PUT /events/:id/votes/order` : tous les votes de l'événement, dans l'ordre voulu. */
export const voteOrderSchema = z.object({ ids: z.array(z.uuid()).min(1).max(100) }).strict();

/** `POST /events/:id/votes/:voteId/candidates` : une candidature, ou le QR d'accès lu sur la voiture. */
export const voteCandidateAddSchema = z.union([
  z.object({ applicationId: z.uuid() }).strict(),
  z.object({ qr: z.string().min(1).max(4000) }).strict(),
]);
export type VoteCandidateAdd = z.infer<typeof voteCandidateAddSchema>;

/** `PUT /events/:id/votes/:voteId/vote`. */
export const voteCastSchema = z.object({ applicationId: z.uuid() }).strict();

export const voteCandidatesQuery = z.object({ cursor: z.coerce.number().int().min(0).max(100_000).default(0) });

// --- Vues ---------------------------------------------------------------------------------------------------------

export type VoteRankingEntry = {
  applicationId: string;
  vehicleLabel: string;
  pseudo: string;
  photoUrl: string | null;
  votes: number;
  rank: number;
};

/** Un vote vu par un passionné (`GET /events/:id/votes`, `GET /events/:id/votes/:voteId`). */
export type VoteView = {
  id: string;
  eventId: string;
  title: string;
  kind: VoteKind;
  state: VoteState;
  /** Ouverture prévue ou constatée ; `null` : à lancer à la main, ou pas encore de premier pointage. */
  opensAt: string | null;
  closesAt: string;
  /** Candidats concourants (entrés) ; les retenues choisies à l'avance mais pas entrées ne comptent pas. */
  candidatesCount: number;
  /** Voix données (aux candidats entrés). */
  total: number;
  /** Pour qui j'ai voté (`applicationId`), `null` sinon. */
  myVote: string | null;
  /** Quand j'ai voté (ou changé ma voix). */
  votedAt: string | null;
  canVote: boolean;
  /** Pourquoi je ne peux pas voter maintenant (`null` si je peux). */
  reason: "vote_closed" | "vote_not_open" | "not_checked_in" | null;
  /** Classement servi selon `canSeeRanking` (3 premiers dans la liste, jusqu'à 100 dans le détail) ; `null` si caché. */
  ranking: VoteRankingEntry[] | null;
  rankingHiddenReason: RankingHiddenReason | null;
  /** Le tampon rare est attaché à ce vote (« Toutes catégories » seulement). */
  rareStamp: boolean;
  /** Mes propres candidatures : pas de voix pour elles. */
  ownApplicationIds: string[];
  /** Mon heure d'entrée ou de contrôle. */
  checkedInAt: string | null;
  /** Résultats figés au règlement (J+2). */
  settled: boolean;
};

export type VoteList = { items: VoteView[] };

/** `GET /events/:id/votes/:voteId/candidates` : la grille, sans aucune voix. */
export type VoteCandidate = {
  applicationId: string;
  vehicleLabel: string;
  pseudo: string;
  photoUrl: string | null;
  /** Faux : retenue choisie à l'avance, pas encore entrée (grisée, ne reçoit pas de voix). */
  eligible: boolean;
};
export type VoteCandidates = { items: VoteCandidate[]; next: number | null };

/** Un vote vu par l'équipe (`GET /events/:id/votes/manage`). */
export type VoteManageItem = {
  id: string;
  title: string;
  kind: VoteKind;
  candidateMode: VoteCandidateMode;
  candidateFilter: VoteCandidateFilter | null;
  openMode: VoteOpenMode;
  opensAt: string | null;
  durationMinutes: number | null;
  state: VoteState;
  openedAt: string | null;
  closedAt: string | null;
  closesAt: string;
  rareStamp: boolean;
  position: number;
  candidatesCount: number;
  total: number;
  /** Classement jusqu'à 100 lignes : l'équipe le voit toujours. */
  ranking: VoteRankingEntry[];
  /** Mode « à la main » : les candidats choisis, entrés ou pas ; `null` pour les autres modes. */
  handCandidates: (VoteCandidate & { entered: boolean; source: VoteCandidateSource })[] | null;
  settled: boolean;
};
/** Réponse d'un ajout de candidat : le vote, la voiture ajoutée, et `added: false` si elle était déjà candidate. */
export type VoteCandidateAdded = VoteManageItem & { addedApplicationId: string; added: boolean };
export type VoteManage = {
  items: VoteManageItem[];
  /** Faux pour le staff (lecture seule). */
  canWrite: boolean;
  /** Véhicules entrés, pour « Prêt à lancer ». */
  vehiclesEntered: number;
  /** Les candidatures dont le véhicule est entré : la recherche d'un candidat dit « pas encore entrée » pour les autres. */
  enteredApplicationIds: string[];
  /** Points du podium (1er, 2e, 3e), lus du réglage de l'administration. */
  podium: [number, number, number];
};

/** `GET /events/:id/votes/templates` : les 9 modèles de titre. */
export type VoteTemplates = {
  items: { id: string; title: string; candidateMode: VoteCandidateMode; candidateFilter: VoteCandidateFilter | null }[];
};

/**
 * Canal `event:{id}:votes`, vote à thème : plus de classement, seulement « quelque chose a changé ». `top3` est toujours
 * vide (l'APK R6-police l'applique sans le tester ; retrait en R8). Autres messages : `votes.opened { voteId }`,
 * `votes.closed { voteId }`, `votes.candidates.changed { voteId? }`.
 */
export type VotesChangedMessage = { voteId: string; total: number; state: VoteState; top3: [] };
