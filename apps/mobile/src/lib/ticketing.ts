// Billetterie de l'organisateur (lot 35c) : du formulaire de l'appli au corps de `PUT /events/:id/ticketing`, avec les
// mêmes règles que la page de l'événement sur le site (`orga-evenement.tsx`) : prix en euros (virgule ou point) de 1 à
// 500 €, places vides = sans limite, nom du billet par défaut « Entrée ». L'API reste juge : elle refuse un prix manquant
// pour un billet payant ouvert et une capacité sous le nombre de billets déjà pris.
import {
  type EventTicketing,
  TICKET_MAX_PRICE_CENTS,
  TICKET_MIN_PRICE_CENTS,
  type TicketingUpdate,
  ticketingUpdateSchema,
} from "@orasso/shared";

/** Les champs tels qu'ils sont saisis. */
export type TicketingForm = { enabled: boolean; name: string; capacity: string; price: string };

/** Prix en centimes → texte de saisie (« 12,50 »), vide sans prix. */
export function priceText(cents: number | null): string {
  if (!cents) return "";
  return (cents / 100).toFixed(2).replace(/\.00$/, "").replace(".", ",");
}

/** « 12,50 € » (espace insécable avant le symbole). */
export function euros(cents: number): string {
  return `${priceText(cents) || "0"} €`;
}

export function formOf(ticketing: EventTicketing): TicketingForm {
  return {
    enabled: ticketing.enabled,
    name: ticketing.name,
    capacity: ticketing.capacity === null ? "" : String(ticketing.capacity),
    price: priceText(ticketing.priceCents),
  };
}

/** Corps de l'API, ou le message d'erreur à afficher sous le formulaire. */
export function ticketingBody(form: TicketingForm, paid: boolean): { body: TicketingUpdate } | { error: string } {
  const capacityText = form.capacity.trim();
  let capacity: number | null = null;
  if (capacityText) {
    capacity = Number(capacityText);
    if (!Number.isInteger(capacity) || capacity < 1) {
      return { error: "Places pour les visiteurs : un nombre entier d'au moins 1, ou vide pour ne pas limiter." };
    }
  }
  let priceCents: number | null = null;
  const priceTextValue = form.price.trim().replace(",", ".").replace(/\s*€$/, "");
  if (paid && priceTextValue) {
    const euro = Number(priceTextValue);
    priceCents = Math.round(euro * 100);
    if (!Number.isFinite(euro) || priceCents < TICKET_MIN_PRICE_CENTS || priceCents > TICKET_MAX_PRICE_CENTS) {
      return { error: "Prix du billet : un montant en euros de 1 à 500 (ex. 12,50)." };
    }
  }
  if (paid && form.enabled && priceCents === null) return { error: "Indique le prix du billet." };
  const parsed = ticketingUpdateSchema.safeParse({
    enabled: form.enabled,
    capacity,
    priceCents,
    name: form.name.trim() || "Entrée",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Réglages invalides." };
  return { body: parsed.data };
}

/** L'accès du public de l'événement ouvre-t-il la billetterie Orasso ? */
export const isTicketed = (publicAccess: string): boolean =>
  publicAccess === "free_reservation" || publicAccess === "paid_orasso";

/** Que dire du compte Stripe de la structure (billets payants) : rien à faire, à connecter, ou « bientôt ». */
export type StripeStep = "soon" | "connect" | "connected";
export function stripeStep(stripe: EventTicketing["stripe"]): StripeStep {
  if (!stripe.configured) return "soon";
  return stripe.connected ? "connected" : "connect";
}
