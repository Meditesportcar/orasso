import { z } from "zod";
import { type ApplicationStatus, applicationStatusSchema } from "../application";
import type { EventFormat } from "../enums";
import {
  type ApplicationKind,
  applicationKinds,
  type FilteringOpinion,
  filteringOpinions,
  type RefusalReason,
  refusalReasonSchema,
  triageDecisions,
} from "../enums";
import { type Grade, gradeSchema } from "../grades";
import type { StructureNoteView } from "./afterEvent";
import { optionalText, pageQuery } from "./common";
import type { ApplicationCrewForTriage, ApplicationCrewInfo } from "./crews";
import type { ProviderForTriage } from "./provider";
import type { MyReview } from "./review";
import type { VehicleFull, VehiclePublic } from "./vehicle";

/** Formulaire de candidature (prototype écran 2/3) : un ou plusieurs véhicules, règlement, deux cases. */
export const applicationCreateSchema = z.object({
  vehicleIds: z.array(z.uuid()).min(1).max(10),
  rulesAccepted: z.literal(true),
  /** « Suivre l'organisateur » : cochée d'office. */
  followStructure: z.boolean().default(true),
  /** « Newsletter Orasso » : non cochée. */
  newsletterOptIn: z.boolean().default(false),
  companions: z.number().int().min(0).max(9).default(0),
  message: optionalText(120),
  /**
   * Événement sur plusieurs jours (lot 26) : le jour choisi ; absent ou `null` = tout l'événement. Obligatoire en
   * accès « par jour », refusé en accès « tout l'événement » et pour un événement d'un jour.
   */
  eventDayId: z.uuid().nullish(),
});
export type ApplicationCreate = z.infer<typeof applicationCreateSchema>;

const refusalRule = (
  v: { decision: string; reasons?: RefusalReason[]; note?: string | null },
  ctx: z.RefinementCtx,
) => {
  if (v.decision !== "refuse") return;
  if (!v.reasons?.length) ctx.addIssue({ code: "custom", path: ["reasons"], message: "Au moins un motif" });
  if (v.reasons?.includes("other") && !v.note) {
    ctx.addIssue({ code: "custom", path: ["note"], message: "Motif « Autre » : note obligatoire" });
  }
};

const decisionFields = z.object({
  decision: z.enum(triageDecisions),
  reasons: z.array(refusalReasonSchema).max(7).optional(),
  note: optionalText(500),
  /** Motifs envoyés au candidat par défaut. */
  sendReasons: z.boolean().default(true),
  zoneId: z.uuid().nullish(),
});

export const decideSchema = decisionFields.superRefine(refusalRule);
export type Decide = z.infer<typeof decideSchema>;

export const decideManySchema = decisionFields
  .extend({ ids: z.array(z.uuid()).min(1).max(200) })
  .superRefine(refusalRule);
export type DecideMany = z.infer<typeof decideManySchema>;

export const waitlistOrderSchema = z.object({ applicationIds: z.array(z.uuid()).max(5000) });
export const zoneAssignSchema = z.object({ zoneId: z.uuid().nullable() });
export const filteringOpinionSchema = z.object({ opinion: z.enum(filteringOpinions), note: optionalText(300) });

export const triageQuerySchema = pageQuery.extend({
  status: applicationStatusSchema.optional(),
  /** Véhicules (défaut) ou prestataires : deux files séparées. */
  kind: z.enum(applicationKinds).default("vehicle"),
  categoryId: z.uuid().optional(),
  makeId: z.uuid().optional(),
  country: z.string().length(2).optional(),
  yearFrom: z.coerce.number().int().optional(),
  yearTo: z.coerce.number().int().optional(),
  grade: gradeSchema.optional(),
  /** Candidatures d'un crew (lot 19). */
  crewId: z.uuid().optional(),
  /** Lot 26 : candidatures d'un jour (identifiant) ou de tout l'événement (`whole`). */
  dayId: z.union([z.uuid(), z.literal("whole")]).optional(),
  q: z.string().trim().max(80).optional(),
  sort: z.enum(["created_at", "waitlist_rank", "year", "pseudo"]).default("created_at"),
});
export type TriageQuery = z.infer<typeof triageQuerySchema>;

/** `GET /events/:id/applications/next` : la file des véhicules (défaut) ou celle des prestataires. */
export const nextQuerySchema = z.object({ kind: z.enum(applicationKinds).default("vehicle") });

export const myApplicationsQuerySchema = z.object({ scope: z.enum(["upcoming", "past"]).default("upcoming") });

/** Carte de l'onglet Accès (prototype : statut, rang, offre et échéance, délai de désistement). */
export type MyApplication = {
  id: string;
  status: ApplicationStatus;
  event: {
    id: string;
    slug: string;
    title: string;
    format: EventFormat;
    startsAt: string;
    endsAt: string;
    city: string | null;
    status: "draft" | "published" | "cancelled";
  };
  vehicle: { id: string; label: string } | null;
  /** Lot 26 : jour choisi d'un événement sur plusieurs jours (`null` = tout l'événement, ou événement d'un jour). */
  day: ApplicationDay | null;
  waitlistRank: number | null;
  offerExpiresAt: string | null;
  /** « Désistement sans pénalité jusqu'au … » (date du verrouillage). */
  withdrawDeadline: string;
  withdrawnAfterLock: boolean;
  refusalReasons: RefusalReason[] | null;
  refusalNote: string | null;
  zone: { code: string; name: string } | null;
  createdAt: string;
  /** « Sur place » : entrée enregistrée (scan, pointage, express). */
  checkedInAt: string | null;
  /** « Pointage en attente » : événement terminé, points pas encore attribués (J+2). */
  pointsPending: boolean;
  /** Points de cette candidature une fois réglée (participation, malus, annulation du malus). */
  points: number | null;
  /** Malus contestable (carnet de route) : échéance, possible ou non, état de la contestation. */
  malus: { deadline: string; canContest: boolean; contestStatus: string | null } | null;
  /** Avis après l'événement (participant pointé seulement, lot 12). */
  review: MyReview | null;
  /** Inscription en crew (lot 19) : le crew, et la venue à confirmer. */
  crew: ApplicationCrewInfo | null;
};

/** Jour d'une candidature (lot 26) : identifiant, date locale `AAAA-MM-JJ`, horaires. */
export type ApplicationDay = { id: string; date: string; startsAt: string; endsAt: string };

export type ApplicationAlert = "duplicatePlate" | "banned" | "unregistered";

/** Fiche de tri (organisateur) : véhicule complet avec la plaque, candidat, historique, alertes. */
export type ApplicationForTriage = {
  id: string;
  kind: ApplicationKind;
  status: ApplicationStatus;
  /** Prestataire : sa fiche (le véhicule est alors `null`). */
  provider: ProviderForTriage | null;
  /** Accréditation « média officiel » (photographe retenu). */
  accreditedMedia: boolean;
  createdAt: string;
  decidedAt: string | null;
  companions: number;
  message: string | null;
  waitlistRank: number | null;
  offerExpiresAt: string | null;
  refusalReasons: RefusalReason[];
  refusalNote: string | null;
  refusalSent: boolean;
  withdrawnAfterLock: boolean;
  zoneId: string | null;
  /** Lot 26 : jour choisi (`null` = tout l'événement, ou événement d'un jour). */
  day: ApplicationDay | null;
  vehicle: VehicleFull | null;
  applicant: {
    userId: string;
    pseudo: string;
    grade: Grade;
    /** Coordonnées : organisateur seulement (null pour le staff de filtration). */
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    email: string | null;
    eventsCount: number;
    absencesCount: number;
    /** Candidatures passées auprès de la même structure. */
    historyWithStructure: { accepted: number; refused: number; total: number };
    /**
     * Notes internes de la structure sur cette personne (lot 27, § 11.4) : organisateur seulement, jamais le staff de
     * filtration ni la personne elle-même.
     */
    notes: StructureNoteView[];
  };
  filteringOpinions: { userId: string; pseudo: string; opinion: FilteringOpinion; note: string | null; at: string }[];
  alerts: ApplicationAlert[];
  /** Crew et autres candidatures du crew (docs/01 « Informations affichées pendant le tri », lot 19). */
  crew: ApplicationCrewForTriage | null;
};

/** Liste des participants vue par un autre utilisateur : jamais de plaque. */
export type ParticipantPublic = { pseudo: string; vehicle: Pick<VehiclePublic, "id" | "label"> | null };
