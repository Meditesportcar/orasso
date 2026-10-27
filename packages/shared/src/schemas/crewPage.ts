import { z } from "zod";
import type { VehicleType } from "../enums";
import type { Grade } from "../grades";
import {
  CREW_OUTING_PLACE_MAX,
  CREW_OUTING_PLACE_MIN,
  CREW_OUTING_PROGRAM_MAX,
  CREW_OUTING_TITLE_MAX,
  CREW_OUTING_TITLE_MIN,
  type CrewOutingRsvp,
  crewOutingRsvps,
} from "../rules/crewPage";
import type { CrewRole } from "../rules/crews";
import { isoDate, optionalText } from "./common";

// Page du crew (lot R5c2, maquettes R5.7 à R5.9) : sorties du crew, garage du crew, « Où va le crew », vitrine.

const outingTitle = z
  .string()
  .trim()
  .min(CREW_OUTING_TITLE_MIN)
  .max(CREW_OUTING_TITLE_MAX)
  .transform((s) => s.replace(/\s+/g, " "));
const outingPlace = z
  .string()
  .trim()
  .min(CREW_OUTING_PLACE_MIN)
  .max(CREW_OUTING_PLACE_MAX)
  .transform((s) => s.replace(/\s+/g, " "));
const lat = z.number().min(-90).max(90).nullish();
const lng = z.number().min(-180).max(180).nullish();
const bothOrNeither = (v: { lat?: number | null; lng?: number | null }) =>
  (v.lat === undefined) === (v.lng === undefined) && (v.lat === null) === (v.lng === null);

/** `POST /crews/:id/outings` : nom, rendez-vous (date et heure), lieu obligatoire, point sur la carte, programme. */
export const crewOutingCreateSchema = z
  .object({
    title: outingTitle,
    startsAt: isoDate,
    place: outingPlace,
    lat,
    lng,
    program: optionalText(CREW_OUTING_PROGRAM_MAX),
  })
  .refine(bothOrNeither, { message: "Le point de rendez-vous demande la latitude et la longitude", path: ["lat"] });
export type CrewOutingCreate = z.infer<typeof crewOutingCreateSchema>;

/** `PATCH /crews/:id/outings/:outingId` (auteur ou chef). */
export const crewOutingUpdateSchema = z
  .object({
    title: outingTitle.optional(),
    startsAt: isoDate.optional(),
    place: outingPlace.optional(),
    lat,
    lng,
    program: optionalText(CREW_OUTING_PROGRAM_MAX).optional(),
  })
  .refine(bothOrNeither, { message: "Le point de rendez-vous demande la latitude et la longitude", path: ["lat"] })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Rien à modifier" });
export type CrewOutingUpdate = z.infer<typeof crewOutingUpdateSchema>;

/** `PUT /crews/:id/outings/:outingId/rsvp`. */
export const crewOutingRsvpSchema = z.object({ answer: z.enum(crewOutingRsvps) });

/** Une personne citée dans la page (qui vient, à qui appartient la voiture). */
export type CrewFace = { pseudo: string; avatarUrl: string | null };

/** Une sortie du crew (réservée aux membres actifs). */
export type CrewOutingView = {
  id: string;
  title: string;
  startsAt: string;
  place: string;
  lat: number | null;
  lng: number | null;
  program: string | null;
  /** Auteur (`null` : compte supprimé). */
  authorPseudo: string | null;
  /** Membres actifs qui viennent (« Je viens »). */
  going: CrewFace[];
  yes: number;
  maybe: number;
  /** Ma réponse. */
  mine: CrewOutingRsvp | null;
  /** Je peux la modifier ou l'annuler (auteur ou chef, avant le rendez-vous : capacité effective, tour 2). */
  canManage: boolean;
  /** Encore à venir : on peut y répondre (pendant les 12 h après le rendez-vous, plus de réponse). */
  open: boolean;
};

/** Un véhicule du garage du crew (photo seulement si la plaque est masquée, comme partout hors du garage). */
export type CrewGarageVehicle = {
  id: string;
  label: string;
  vehicleType: VehicleType;
  photoUrl: string | null;
  ownerPseudo: string;
  isMain: boolean;
};

/** « Où va le crew » : un événement Orasso à venir où des membres sont retenus, ou où le crew est inscrit. */
export type CrewEventView = {
  slug: string;
  title: string;
  startsAt: string;
  city: string | null;
  /** Membres retenus (candidature acceptée, quelle que soit la façon). */
  going: CrewFace[];
  /** Membres inscrits par le crew (inscription en crew en cours ou retenue). */
  registered: number;
};

/** Un membre dans la vitrine (aussi vue des non-membres, décision de Damien du 26/10). */
export type CrewVitrineMember = {
  pseudo: string;
  avatarUrl: string | null;
  grade: Grade;
  role: CrewRole;
  /**
   * Lot R6b : la personne qui regarde la suit (abonnement accepté), « 2 personnes que tu suis en font partie ». Le nom
   * du champ reste (plus petit changement, lot R6a en parallèle sur la page du crew).
   */
  friend: boolean;
};

/** Ce que voient les membres actifs en plus de la vitrine. */
export type CrewSpace = {
  /** Messages non lus de la discussion du crew. */
  unreadCount: number;
  /** Réglage du crew : les membres peuvent proposer une sortie. */
  membersCanProposeOutings: boolean;
  /** Je peux proposer une sortie. */
  canProposeOuting: boolean;
  outings: CrewOutingView[];
  garage: CrewGarageVehicle[];
  events: CrewEventView[];
};
