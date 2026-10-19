// Action principale de la fiche v2 selon le profil (lot 44, `s-event`) : fonction pure (testée). Exposant : candidater
// avec son véhicule (ou voir sa candidature) ; visiteur : réserver son entrée (billetterie Orasso), sinon suivre
// l'organisateur ; pro : suivre l'organisateur ; prestataire : candidater comme prestataire ; média : son accréditation
// (lot 55) ; organisateur de l'événement : trier les candidatures. Fermé : on dit pourquoi et quoi faire.
import type { RegistrationBlock } from "@orasso/shared";

export type ProfileKind = "guest" | "fan" | "visitor" | "organizer" | "pro" | "provider" | "media" | "admin";

export type EventAction =
  | "triage"
  | "apply"
  | "applyGuest"
  | "myApplication"
  | "book"
  | "followOrganizer"
  | "providerApply"
  | null;

/** Encart à la place du bouton : complet (liste d'attente), inscriptions closes (raison), pas encore ouvert. */
export type EventGate = "full" | "locked" | "soon" | null;

export type EventActionInput = {
  kind: ProfileKind;
  /** L'organisateur regarde un événement de sa structure. */
  ownStructure: boolean;
  hasApplication: boolean;
  canApply: boolean;
  full: boolean;
  block: RegistrationBlock | null;
  hasTicketOffer: boolean;
  providerCanApply: boolean;
  cancelled: boolean;
};

export function eventAction(i: EventActionInput): { action: EventAction; gate: EventGate } {
  if (i.cancelled) return { action: null, gate: null };
  if (i.kind === "organizer" && i.ownStructure) return { action: "triage", gate: null };
  if (i.kind === "media") return { action: null, gate: null };
  if (i.kind === "provider") return { action: i.providerCanApply ? "providerApply" : null, gate: null };
  if (i.kind === "pro") return { action: "followOrganizer", gate: null };
  if (i.kind === "visitor") return { action: i.hasTicketOffer ? "book" : "followOrganizer", gate: null };
  // Exposant, invité sans compte, administrateur, organisateur d'une autre structure : la candidature.
  if (i.hasApplication) return { action: "myApplication", gate: null };
  const gate: EventGate =
    i.block?.code === "locked"
      ? "locked"
      : i.block?.code === "preview" || i.block?.code === "not_open"
        ? "soon"
        : i.full
          ? "full"
          : null;
  if (gate) return { action: null, gate };
  if (i.canApply) return { action: i.kind === "guest" ? "applyGuest" : "apply", gate: null };
  return { action: null, gate: null };
}
