import { z } from "zod";

import type { ApplicationStatus } from "../application";
import { departmentSchema } from "../enums";
import type { Grade } from "../grades";
import {
  CREW_DESCRIPTION_MAX,
  CREW_NAME_MAX,
  CREW_NAME_MIN,
  CREW_REQUEST_MESSAGE_MAX,
  type CrewRole,
  type CrewViewerState,
  MEMBERS_PER_CREW,
} from "../rules/crews";
import { optionalText, pageQuery } from "./common";
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

export const crewUpdateSchema = z
  .object({
    name: crewName.optional(),
    description: optionalText(CREW_DESCRIPTION_MAX),
    department: departmentSchema.optional(),
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
});
export type CrewRegistration = z.infer<typeof crewRegistrationSchema>;

/** Confirmation de venue d'un membre : règlement accepté, et ses propres réglages de candidature. */
export const crewConfirmSchema = z.object({
  rulesAccepted: z.literal(true),
  followStructure: z.boolean().default(true),
  companions: z.number().int().min(0).max(9).default(0),
  message: optionalText(120),
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
};

export type MyCrew = CrewCard & { role: CrewRole };

export type CrewPerson = { userId: string; pseudo: string; avatarUrl: string | null; grade: Grade };

/**
 * Fiche d'un crew pour toute personne connectée (S16 : nom, logo, description, département, nombre de membres, chef).
 * La discussion et la liste des membres sont réservées aux membres.
 */
export type CrewView = CrewCard & {
  description: string | null;
  leader: { pseudo: string; avatarUrl: string | null } | null;
  createdAt: string;
  archived: boolean;
  viewerState: CrewViewerState;
  /** Membres seulement. */
  conversationId: string | null;
  /** Chef seulement : demandes et invitations en attente. */
  pendingRequests: number | null;
  pendingInvitations: number | null;
};

export type CrewMemberView = CrewPerson & { role: CrewRole; joinedAt: string | null };

/** Chef : demandes reçues et invitations envoyées en attente. */
export type CrewPendingView = { person: CrewPerson; message: string | null; createdAt: string };
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
