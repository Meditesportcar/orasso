// Billetterie (docs/01 « Billetterie ») : billets gratuits réels avant le 21 juin 2027, billets payants en mode
// présentation (Stripe Connect en mode test, aucun encaissement réel). Fonctions pures.
import type { EventPublicAccess, EventStatus } from "../enums";

/** Billets par commande. */
export const TICKET_MAX_PER_ORDER = 4;

/** Date avant laquelle aucun encaissement réel n'existe (docs/01 : lancement des paiements au 21 juin 2027). */
export const PAYMENTS_OPEN_AT = new Date("2027-06-21T00:00:00+02:00");

/**
 * Commission de la plateforme sur un billet payant, en points de base (500 = 5 %). Taux provisoire : docs/01 dit
 * seulement « pourcentage de commission » ; **à revoir avec Damien** (journal des choix).
 */
export const PLATFORM_FEE_BASIS_POINTS = 500;

/** Prix d'un billet payant : de 1 € à 500 €. */
export const TICKET_MIN_PRICE_CENTS = 100;
export const TICKET_MAX_PRICE_CENTS = 50_000;

/** Commission de la plateforme sur un montant (arrondie au centime). */
export function platformFeeCents(amountCents: number, basisPoints = PLATFORM_FEE_BASIS_POINTS): number {
  return Math.round((amountCents * basisPoints) / 10_000);
}

/** Pourquoi la billetterie d'un événement n'est pas ouverte (`null` quand elle l'est). */
export type TicketingBlock =
  | "not_ticketed" // l'événement n'a pas la billetterie Orasso (entrée libre, externe, fermée)
  | "general_off" // interrupteur général de l'administration éteint
  | "event_off" // l'organisateur n'a pas activé la billetterie pour cet événement
  | "not_published"
  | "finished"
  | "sold_out"
  | "payments_soon"; // billets payants : Stripe non configuré ou compte de l'organisateur non connecté

export type TicketingInput = {
  publicAccess: EventPublicAccess;
  status: EventStatus;
  endsAt: Date;
  generalSwitch: boolean;
  eventSwitch: boolean;
  /** Places restantes (`null` = sans limite). */
  remaining: number | null;
  /** Billets payants : la plateforme sait encaisser (test) et le compte de l'organisateur est connecté. */
  paymentsReady: boolean;
};

export function ticketingBlock(i: TicketingInput, at: Date): TicketingBlock | null {
  if (i.publicAccess !== "free_reservation" && i.publicAccess !== "paid_orasso") return "not_ticketed";
  if (i.status !== "published") return "not_published";
  if (at >= i.endsAt) return "finished";
  if (i.publicAccess === "free_reservation" && !i.generalSwitch) return "general_off";
  if (i.publicAccess === "free_reservation" && !i.eventSwitch) return "event_off";
  if (i.publicAccess === "paid_orasso") {
    if (!i.eventSwitch) return "event_off";
    if (!i.paymentsReady) return "payments_soon";
  }
  if (i.remaining !== null && i.remaining <= 0) return "sold_out";
  return null;
}

export const ticketingBlockLabels: Record<TicketingBlock, string> = {
  not_ticketed: "Pas de billetterie Orasso",
  general_off: "Réservation momentanément indisponible",
  event_off: "La billetterie n'est pas ouverte pour cet événement",
  not_published: "Événement non publié",
  finished: "Événement terminé",
  sold_out: "Complet",
  payments_soon: "Billetterie payante bientôt disponible",
};

/** Clés de réglage de la plateforme (table `platform_settings`, modifiées par le super admin). */
export const platformSettingKeys = ["ticketing.free_enabled", "ticketing.presentation_mode"] as const;
export type PlatformSettingKey = (typeof platformSettingKeys)[number];

export const platformSettingDefaults: Record<PlatformSettingKey, boolean> = {
  /** Billets gratuits : ouverts par défaut (événement par événement ensuite). */
  "ticketing.free_enabled": true,
  /** Mode présentation : aucun encaissement réel. Ne peut pas être coupé avant le 21 juin 2027. */
  "ticketing.presentation_mode": true,
};

export const platformSettingLabels: Record<PlatformSettingKey, string> = {
  "ticketing.free_enabled": "Billets gratuits (réservation du public)",
  "ticketing.presentation_mode": "Billetterie payante en mode présentation (aucun encaissement réel)",
};

/** Le mode présentation est imposé jusqu'à la date d'ouverture des paiements. */
export function presentationForced(at: Date): boolean {
  return at < PAYMENTS_OPEN_AT;
}
