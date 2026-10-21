// Billetterie : réglages, réservation, billets, contrôle à l'entrée, compte Stripe de l'organisateur (lot 14).
import { z } from "zod";

import {
  platformSettingKeys,
  TICKET_MAX_PER_ORDER,
  TICKET_MAX_PRICE_CENTS,
  TICKET_MIN_PRICE_CENTS,
  type TicketingBlock,
} from "../rules/ticketing";

export const ticketingUpdateSchema = z.object({
  /** Interrupteur de l'événement (deuxième niveau, après l'interrupteur général de l'administration). */
  enabled: z.boolean(),
  /** Places pour le public ; `null` = sans limite. */
  capacity: z.number().int().min(1).max(100_000).nullable(),
  /** Billets payants : prix en centimes. Ignoré pour les billets gratuits. */
  priceCents: z.number().int().min(TICKET_MIN_PRICE_CENTS).max(TICKET_MAX_PRICE_CENTS).nullish(),
  /** Nom du billet (« Entrée »). */
  name: z.string().trim().min(2).max(60).default("Entrée"),
});
export type TicketingUpdate = z.infer<typeof ticketingUpdateSchema>;

export const ticketReserveSchema = z.object({
  quantity: z.number().int().min(1).max(TICKET_MAX_PER_ORDER).default(1),
});
export type TicketReserve = z.infer<typeof ticketReserveSchema>;

export const ticketCheckSchema = z.object({ payload: z.string().trim().min(1).max(200) });

export const platformSettingUpdateSchema = z.object({ value: z.boolean() });
export const platformSettingKeySchema = z.enum(platformSettingKeys);

export const stripeCallbackQuery = z.object({
  code: z.string().min(1).max(200).optional(),
  state: z.string().min(1).max(400).optional(),
  error: z.string().max(200).optional(),
  error_description: z.string().max(500).optional(),
});

// --- Vues ---------------------------------------------------------------------------------------------------

/** Ce que voit le public sur la page d'un événement. */
export type TicketOffer = {
  kind: "free" | "paid";
  /** `null` = la réservation est ouverte. */
  block: TicketingBlock | null;
  blockLabel: string | null;
  name: string;
  /** Prix en centimes (billets payants), `null` pour un billet gratuit. */
  priceCents: number | null;
  /** Places restantes, `null` = sans limite. */
  remaining: number | null;
  maxPerOrder: number;
  /** Billets payants : paiement de démonstration (Stripe en mode test, aucun encaissement réel). */
  testMode: boolean;
};

export type TicketStatus = "valid" | "cancelled" | "used";

export type MyTicket = {
  id: string;
  status: TicketStatus;
  usedAt: string | null;
  /** Charge utile du QR (OR1…), signée comme le QR d'inscription. */
  payload: string;
  name: string;
  priceCents: number | null;
  testMode: boolean;
  event: {
    id: string;
    slug: string;
    title: string;
    startsAt: string;
    endsAt: string;
    city: string | null;
    structureName: string;
  };
};

export type StripeAccountState = {
  /** Variables Stripe de la plateforme renseignées (sinon : billetterie payante « bientôt »). */
  configured: boolean;
  /** `test` quand la clé est une clé de test ; `off` sans clé. Jamais `live` dans cette version. */
  mode: "off" | "test";
  connected: boolean;
  /** Identifiant du compte connecté, tronqué (« acct_…1234 »). */
  accountHint: string | null;
};

export type EventTicketing = {
  enabled: boolean;
  publicAccess: string;
  name: string;
  capacity: number | null;
  priceCents: number | null;
  sold: number;
  used: number;
  generalSwitch: boolean;
  /** Pourquoi la réservation n'est pas ouverte (`null` = ouverte). */
  block: TicketingBlock | null;
  blockLabel: string | null;
  stripe: StripeAccountState;
  presentationMode: boolean;
};

export type TicketHolderRow = {
  id: string;
  pseudo: string;
  status: TicketStatus;
  usedAt: string | null;
  orderPaid: boolean;
};

export type TicketHolders = {
  event: { title: string; slug: string };
  sold: number;
  used: number;
  items: TicketHolderRow[];
};

export type TicketCheckResult =
  | { result: "ok"; pseudo: string; ticketName: string; usedAt: string }
  | { result: "already"; pseudo: string; ticketName: string; usedAt: string }
  | { result: "refused"; reason: "malformed" | "forged" | "other_event" | "cancelled" | "unknown" };

export type PlatformSettings = Record<(typeof platformSettingKeys)[number], boolean> & {
  /** `true` tant que la date d'ouverture des paiements n'est pas passée : le mode présentation ne peut pas être coupé. */
  presentationForced: boolean;
  stripe: { configured: boolean; mode: "off" | "test" };
};
