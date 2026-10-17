import { z } from "zod";
import type { ApplicationStatus } from "../application";
import type { EventFormat, EventStatus, InvitationStatus, VehicleType } from "../enums";
import { INVITATION_MESSAGE_MAX, INVITATIONS_PER_REQUEST } from "../rules/invitations";
import { optionalText } from "./common";

// Invitations nominatives et événement privé (lot 25, ARCHITECTURE-SUITE § 9.1).

const pseudo = z.string().trim().min(1).max(40);

/** `POST /events/:id/invitations` : une ligne par cible (personne par pseudo, véhicule, adresse e-mail). */
export const invitationCreateSchema = z
  .object({
    pseudos: z.array(pseudo).max(INVITATIONS_PER_REQUEST).default([]),
    vehicleIds: z.array(z.uuid()).max(INVITATIONS_PER_REQUEST).default([]),
    emails: z.array(z.email().max(254)).max(INVITATIONS_PER_REQUEST).default([]),
    message: optionalText(INVITATION_MESSAGE_MAX),
  })
  .refine((v) => v.pseudos.length + v.vehicleIds.length + v.emails.length > 0, {
    message: "Choisis au moins une personne, un véhicule ou une adresse",
  })
  .refine((v) => v.pseudos.length + v.vehicleIds.length + v.emails.length <= INVITATIONS_PER_REQUEST, {
    message: `Au plus ${INVITATIONS_PER_REQUEST} invitations par envoi`,
  });
export type InvitationCreate = z.infer<typeof invitationCreateSchema>;

/** `POST /events/:id/invitations/from-event` : les véhicules retenus d'une édition précédente de la même structure. */
export const invitationFromEventSchema = z.object({
  sourceEventId: z.uuid(),
  message: optionalText(INVITATION_MESSAGE_MAX),
});
export type InvitationFromEvent = z.infer<typeof invitationFromEventSchema>;

/** `POST /event-invitations/:id/accept` : le véhicule (imposé pour une invitation de véhicule). */
export const invitationAcceptSchema = z.object({ vehicleId: z.uuid().optional() });
export type InvitationAccept = z.infer<typeof invitationAcceptSchema>;

export type InvitationTargetKind = "user" | "vehicle" | "email";

/** Raison d'une cible non invitée (réponse de création, sans rien révéler d'un compte). */
export type InvitationSkipReason = "unknown" | "already_invited" | "recent" | "banned" | "self" | "quota";

export type InvitationCreateResult = {
  created: number;
  skipped: { target: string; reason: InvitationSkipReason }[];
};

/** Ce que l'invité voit d'un véhicule invité : marque, modèle, génération (jamais la plaque). */
export type InvitationVehicle = { id: string; label: string };

export type InvitationEventBrief = {
  id: string;
  slug: string;
  title: string;
  format: EventFormat;
  startsAt: string;
  endsAt: string;
  city: string | null;
  posterUrl: string | null;
  status: EventStatus;
  privateEvent: boolean;
  /** Validité de l'invitation (S24) : le verrouillage des inscriptions. */
  lockAt: string;
  rulesText: string | null;
  admittedVehicleTypes: VehicleType[];
  structure: { name: string; slug: string; logoUrl: string | null };
};

/** Invitation reçue (Accès > Invitations reçues, Boîte > Demandes). */
export type ReceivedInvitation = {
  id: string;
  status: InvitationStatus;
  message: string | null;
  createdAt: string;
  event: InvitationEventBrief;
  vehicle: InvitationVehicle | null;
  application: { id: string; status: ApplicationStatus } | null;
};

/** `GET /invitation-evenement/:token` (public) : de quoi afficher la page du lien. */
export type InvitationLinkView = {
  status: InvitationStatus;
  event: InvitationEventBrief;
  invitedBy: string;
  vehicle: InvitationVehicle | null;
  /** Connecté : l'invitation est déjà à moi (ou peut l'être : même adresse e-mail). */
  mine: boolean;
  invitationId: string | null;
};

/** Ligne de la liste de l'organisateur. */
export type OrganizerInvitation = {
  id: string;
  kind: InvitationTargetKind;
  status: InvitationStatus;
  pseudo: string | null;
  vehicle: InvitationVehicle | null;
  email: string | null;
  message: string | null;
  createdAt: string;
  sentAt: string | null;
  /** Invitation par e-mail : l'e-mail n'est pas parti (budget du jour atteint). */
  mailSkipped: boolean;
  declinedAt: string | null;
  sourceEventId: string | null;
  application: { id: string; status: ApplicationStatus } | null;
};

/** Éditions précédentes proposées à « Inviter les retenus de l'édition … ». */
export type InvitationSourceEvent = { id: string; title: string; startsAt: string; acceptedCount: number };

/** Abonnés et retenus passés de la structure, pour choisir des véhicules (§ 9.1, docs/01 « expositions sur invitation »). */
export type InvitationCandidate = {
  vehicleId: string;
  label: string;
  pseudo: string;
  photoUrl: string | null;
  source: "follower" | "past";
};

/** `POST /event-invitations/:id/accept` : retenu, ou liste d'attente en tête si l'événement est complet (S25). */
export type InvitationAcceptResult = {
  outcome: "accepted" | "waitlisted";
  applicationId: string;
};
