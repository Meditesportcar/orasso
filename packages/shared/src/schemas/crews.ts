import { z } from "zod";

import type { ApplicationStatus } from "../application";
import { departmentSchema } from "../enums";
import type { Grade } from "../grades";
import { crewInstagramHandle } from "../rules/crewPage";
import {
  CREW_DESCRIPTION_MAX,
  CREW_NAME_MAX,
  CREW_NAME_MIN,
  CREW_REQUEST_MESSAGE_MAX,
  type CrewRole,
  type CrewViewerState,
  MEMBERS_PER_CREW,
} from "../rules/crews";
import { arrivalAnswerFields, optionalText, pageQuery } from "./common";
import type { CrewSpace, CrewVitrineMember } from "./crewPage";
import { pseudoSchema } from "./profile";

// Crews et inscription en crew (lot 19). Routes : ARCHITECTURE-SUITE § 4.3.

const crewName = z
  .string()
  .trim()
  .min(CREW_NAME_MIN)
  .max(CREW_NAME_MAX)
  .transform((s) => s.replace(/\s+/g, " "));

export const crewCreateSchema = z.object({
  name: crewName,
  description: optionalText(CREW_DESCRIPTION_MAX),
  department: departmentSchema,
});
export type CrewCreate = z.infer<typeof crewCreateSchema>;

/**
 * Lot R5c2 : Instagram du crew, le pseudo seul (« @pseudo », « pseudo » ou l'adresse du compte sont acceptés) ; vide
 * le retire. Une publication, un autre site ou des caractères interdits sont refusés.
 */
export const crewInstagramSchema = z
  .string()
  .trim()
  .max(200)
  .nullable()
  .transform((v, ctx) => {
    const handle = crewInstagramHandle(v);
    if (handle === undefined) {
      ctx.addIssue({ code: "custom", message: "Indique le pseudo Instagram du crew (ex. @roussillondrift)." });
      return z.NEVER;
    }
    return handle;
  });

export const crewUpdateSchema = z
  .object({
    name: crewName.optional(),
    description: optionalText(CREW_DESCRIPTION_MAX),
    department: departmentSchema.optional(),
    instagram: crewInstagramSchema.optional(),
    /** Lot R5c2 (Damien, 26/10) : « Les membres peuvent proposer une sortie » ; le chef peut toujours. */
    membersCanProposeOutings: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Rien à modifier" });
export type CrewUpdate = z.infer<typeof crewUpdateSchema>;

/** Logo : clé rendue par `POST /me/uploads` avec `purpose=crew_logo` ; `null` retire le logo. */
export const crewLogoSchema = z.object({ key: z.string().min(10).max(200).nullable() });

export const crewRequestSchema = z.object({ message: optionalText(CREW_REQUEST_MESSAGE_MAX) });
export const crewInviteSchema = z.object({ pseudo: pseudoSchema });

/** Trouvables par leur nom et leur département (docs/01). */
export const crewSearchQuery = pageQuery.extend({
  q: z.string().trim().max(60).optional(),
  department: departmentSchema.optional(),
  /** Lot R2, tour 2 (« Mon coin » choisi) : l'un de ces départements, séparés par des virgules. */
  departments: z.preprocess(
    (v) => (typeof v === "string" ? v.split(",").filter(Boolean) : v),
    z.array(departmentSchema).max(20).optional(),
  ),
});
export type CrewSearchQuery = z.infer<typeof crewSearchQuery>;

/** Inscription en crew par le chef : qui vient et avec quel véhicule (docs/01 « trier les candidatures »). */
export const crewRegistrationSchema = z.object({
  crewId: z.uuid(),
  members: z
    .array(z.object({ userId: z.string().min(1).max(64), vehicleId: z.uuid() }))
    .min(1)
    .max(MEMBERS_PER_CREW),
  /** Le chef accepte le règlement pour sa propre candidature s'il vient (les membres l'acceptent en confirmant). */
  rulesAccepted: z.literal(true),
  followStructure: z.boolean().default(true),
  message: optionalText(120),
  /** Lot 26 : jour choisi par le chef pour tout le crew (événement sur plusieurs jours) ; `null` = tout l'événement. */
  eventDayId: z.uuid().nullish(),
  /** Lot 47 : la case « J'ai vu » et la note valent pour le chef ; chaque membre coche à sa confirmation. */
  ...arrivalAnswerFields,
});
export type CrewRegistration = z.infer<typeof crewRegistrationSchema>;

/** Confirmation de venue d'un membre : règlement accepté, et ses propres réglages de candidature. */
export const crewConfirmSchema = z.object({
  rulesAccepted: z.literal(true),
  followStructure: z.boolean().default(true),
  companions: z.number().int().min(0).max(9).default(0),
  message: optionalText(120),
  /** Lot 47 : « J'ai vu » l'horaire d'arrivée des exposants (obligatoire s'il existe) et la note du membre. */
  ...arrivalAnswerFields,
});
export type CrewConfirm = z.infer<typeof crewConfirmSchema>;

export const crewOptionsQuery = z.object({ crewId: z.uuid() });

/** Une ligne de résultat de recherche, de « mes crews », d'un profil. */
export type CrewCard = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  department: string;
  membersCount: number;
  /**
   * Lot R3b : ma demande pour rejoindre ce crew est envoyée (vue par moi : un refus reste « envoyée » 30 jours). Donné
   * par la recherche de crews, pour que « Demande envoyée » survive à un rechargement ; absent ailleurs.
   */
  requested?: boolean;
};

export type MyCrew = CrewCard & { role: CrewRole };

export type CrewPerson = { userId: string; pseudo: string; avatarUrl: string | null; grade: Grade };

/**
 * Fiche d'un crew pour toute personne connectée. Lot R5c2 (décision de Damien du 26/10) : un non-membre voit la vitrine,
 * c'est-à-dire l'image du crew (logo, bannière dont la plaque est traitée), la description, l'Instagram et les membres
 * (pseudo, avatar, grade, rôle) ; rien d'autre : ni garage, ni fil, ni sorties, ni discussion (`space` et
 * `conversationId` à `null`).
 */
export type CrewView = CrewCard & {
  description: string | null;
  leader: { pseudo: string; avatarUrl: string | null } | null;
  createdAt: string;
  archived: boolean;
  viewerState: CrewViewerState;
  /** Bannière ; hors du crew, seulement si sa plaque est masquée ou « aucune plaque visible » confirmé. */
  bannerUrl: string | null;
  /** Pseudo Instagram du crew (sans « @ »). */
  instagram: string | null;
  /** Membres actifs (comptes supprimés, bannis ou suspendus exclus), le chef d'abord. */
  members: CrewVitrineMember[];
  /** Membres seulement. */
  conversationId: string | null;
  /** Membres actifs seulement (crew non dissous) : sorties, garage, « Où va le crew », non-lus de la discussion. */
  space: CrewSpace | null;
  /** Chef seulement : demandes et invitations en attente. */
  pendingRequests: number | null;
  pendingInvitations: number | null;
  /** Chef seulement : la bannière existe mais n'est pas montrée hors du crew (aucune décision sur la plaque). */
  bannerHiddenOutside: boolean | null;
};

/** Lot R5c2 : le véhicule principal du membre (« Toyota Supra Mk4 »), `null` sans véhicule actif. */
export type CrewMemberView = CrewPerson & { role: CrewRole; joinedAt: string | null; vehicleLabel: string | null };

/** Chef : demandes reçues et invitations envoyées en attente. */
export type CrewPendingView = {
  person: CrewPerson;
  message: string | null;
  createdAt: string;
  /** Lot R5c2 : demande reçue, le véhicule principal de la personne (la feuille de demande le lui dit). */
  vehicleLabel: string | null;
};
export type CrewPendingList = { requests: CrewPendingView[]; invitations: CrewPendingView[] };

/** Boîte > Demandes : demande reçue par le chef, ou invitation reçue. */
export type CrewInboxRequest = {
  kind: "request" | "invitation";
  crew: CrewCard;
  person: CrewPerson;
  message: string | null;
  createdAt: string;
};

/** Boîte > Demandes : venue en crew à confirmer (candidature `awaiting_member`). */
export type CrewConfirmationRequest = {
  applicationId: string;
  crew: { id: string; slug: string; name: string; logoUrl: string | null };
  leaderPseudo: string | null;
  event: { id: string; slug: string; title: string; startsAt: string; city: string | null };
  vehicleLabel: string | null;
  confirmBefore: string;
};

/** Chef : véhicules admissibles de chaque membre pour inscrire le crew à un événement. */
export type CrewRegistrationOptions = {
  crew: { id: string; name: string };
  members: {
    person: CrewPerson;
    isLeader: boolean;
    /** Raison pour laquelle la personne ne peut pas être inscrite (candidature en cours, bannie…). */
    blocked: string | null;
    vehicles: { id: string; label: string; photoUrl: string | null; blocked: string | null }[];
  }[];
};

/** Chef : ses inscriptions en crew sur un événement. */
export type CrewRegistrationView = {
  crew: { id: string; slug: string; name: string };
  members: {
    applicationId: string;
    pseudo: string;
    vehicleLabel: string | null;
    status: ApplicationStatus;
    confirmed: boolean;
    confirmBefore: string | null;
  }[];
};

/** Carte Accès : la candidature vient d'une inscription en crew. */
export type ApplicationCrewInfo = {
  id: string;
  slug: string;
  name: string;
  leaderPseudo: string | null;
  /** Venue à confirmer (`awaiting_member`) et son échéance. */
  awaitingMember: boolean;
  confirmBefore: string | null;
};

/** Fiche de tri : le crew et les autres candidatures confirmées du crew (« 2 / 3 confirmés »). */
export type ApplicationCrewForTriage = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  /** Crew dissous : pas de lien vers sa fiche. */
  archived: boolean;
  /** Membres (une fois chacun) dont la venue est confirmée / membres inscrits, sans les annulées ni les désistées. */
  confirmed: number;
  total: number;
  /** Candidatures confirmées du même crew sur cet événement (les membres non confirmés ne sont jamais nommés). */
  members: { applicationId: string; pseudo: string; status: ApplicationStatus }[];
};

/** Filtre « crew » du tri : les crews inscrits à l'événement. */
export type EventCrewFilter = { id: string; name: string; count: number };
