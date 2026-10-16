// Staff côté site, rôle boutique et compléments du jour J (lot 24) : demandes pour devenir staff, contrôle des billets
// du public hors ligne, compteur d'entrées visiteurs, photo de la main courante, position de l'alerte.
import { z } from "zod";
import type { TicketRefusal } from "../qr/ticket";
import { type StaffRole, staffRoleSchema } from "../roles";
import { isoDate, optionalText } from "./common";

// --- Devenir staff ---------------------------------------------------------------------------------------------

/** `POST /api/structures/:id/staff-requests` : un mot facultatif pour l'organisateur. */
export const staffRequestSchema = z.object({ message: optionalText(300) });
export type StaffRequestInput = z.infer<typeof staffRequestSchema>;

/** `POST /api/structures/:id/members/:userId/accept` : rôles donnés d'emblée (facultatif, modifiables ensuite). */
export const staffRequestAcceptSchema = z.object({
  staffRoles: z.array(staffRoleSchema).max(6).default([]),
  canDecide: z.boolean().default(false),
});
export type StaffRequestAccept = z.infer<typeof staffRequestAcceptSchema>;

/** `POST /api/events/:id/staff/remind` : « Relancer » tout ceux qui n'ont pas répondu, ou une seule personne. */
export const staffRemindSchema = z.object({ userId: z.string().min(1).max(64).optional() });

/** `GET /api/me/staff-invitations` : invitations à rejoindre une structure, à accepter ou refuser (Boîte > Demandes). */
export type StaffInvitationView = {
  structureId: string;
  structureSlug: string;
  structureName: string;
  logoUrl: string | null;
  /** `staff` ou `co_organizer`. */
  role: "staff" | "co_organizer";
  staffRoles: StaffRole[];
  invitedBy: string | null;
  invitedAt: string;
};

/** Limites de la gestion du staff (gardes contre la répétition et l'abus). */
export const STAFF_PENDING_MAX = 50;
/** Après un refus ou un retrait, la même personne ne redemande pas avant ce délai. */
export const STAFF_REQUEST_COOLDOWN_MS = 24 * 3_600_000;

// --- Contrôle des billets (rôle boutique) ----------------------------------------------------------------------

export const ticketScanDecisions = ["ok", "already", "refused"] as const;
export type TicketScanLocalDecision = (typeof ticketScanDecisions)[number];

export const ticketScanItemSchema = z.object({
  /** Généré par l'appareil : clé d'idempotence. */
  id: z.uuid(),
  /** QR lu tel quel : le serveur le vérifie lui-même (signature, événement), sans croire l'appareil. */
  rawPayload: z.string().trim().min(1).max(512),
  decision: z.enum(ticketScanDecisions),
  reason: optionalText(40),
  scannedAt: isoDate,
});

/** `POST /api/events/:id/ticket-scans` : un lot de lectures d'un appareil (≤ 200), idempotent par `id`. */
export const ticketScanBatchSchema = z.object({
  deviceId: z.uuid().nullish(),
  items: z.array(ticketScanItemSchema).min(1).max(200),
});
export type TicketScanBatch = z.infer<typeof ticketScanBatchSchema>;
export type TicketScanItem = z.infer<typeof ticketScanItemSchema>;

export const ticketScanServerResults = ["accepted", "already", "refused", "rejected"] as const;
export type TicketScanServerResult = (typeof ticketScanServerResults)[number];

export type TicketScanResultView = {
  id: string;
  /** `accepted` : première lecture, billet passé à « utilisé » ; `already` : déjà utilisé (ici ou ailleurs) ;
   *  `refused` : QR falsifié, autre événement, billet inconnu ou annulé ; `rejected` : boutique fermée / points réglés. */
  result: TicketScanServerResult;
  reason?: TicketRefusal | "unknown" | "shop_disabled" | "settled";
  /** Heure retenue d'utilisation du billet (la plus ancienne). */
  usedAt: string | null;
  ticketName: string | null;
};

// --- Compteur d'entrées visiteurs ------------------------------------------------------------------------------

export const visitorDeltas = [-10, -1, 1, 10] as const;
export type VisitorDelta = (typeof visitorDeltas)[number];

export const visitorEntryItemSchema = z.object({
  /** Généré par l'appareil : clé d'idempotence (un toucher = une ligne). */
  id: z.uuid(),
  delta: z.union([z.literal(-10), z.literal(-1), z.literal(1), z.literal(10)]),
  at: isoDate,
});

/** `POST /api/events/:id/visitor-entries` : touchers du compteur d'un appareil (≤ 200), idempotents par `id`. */
export const visitorEntryBatchSchema = z.object({
  deviceId: z.uuid().nullish(),
  items: z.array(visitorEntryItemSchema).min(1).max(200),
});
export type VisitorEntryBatch = z.infer<typeof visitorEntryBatchSchema>;

export type VisitorEntriesResult = {
  results: { id: string; applied: boolean }[];
  /** Total de l'événement après ces touchers (tous appareils, jamais négatif). */
  total: number;
};

// --- Main courante et alertes ----------------------------------------------------------------------------------

/** `PATCH /api/events/:id/incidents/:incidentId` : photo envoyée après coup (`POST /me/uploads purpose=incident`). */
export const incidentPhotoSchema = z.object({ photoKey: z.string().trim().min(1).max(200) });

/** Une alerte du staff : la position n'existe que tant que l'alerte est ouverte. */
export type StaffAlertView = {
  id: string;
  pseudo: string | null;
  lat: number | null;
  lng: number | null;
  /** Distance à l'entrée de l'événement (mètres), si la position et l'adresse de l'événement sont connues. */
  distanceM: number | null;
  message: string | null;
  createdAt: string;
  resolvedAt: string | null;
};

export type IncidentView = {
  id: string;
  reporter: string | null;
  occurredAt: string;
  location: string | null;
  lat: number | null;
  lng: number | null;
  description: string;
  createdAt: string;
  /** La photo est privée : `GET /api/events/:id/incidents/:incidentId/photo` (staff de l'événement seulement). */
  hasPhoto: boolean;
};
