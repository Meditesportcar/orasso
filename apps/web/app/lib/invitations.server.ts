// Réponses aux invitations nominatives (lot 25), partagées par Accès, Boîte > Demandes et la page du lien.
import { type InvitationAcceptResult, invitationLabels, type VehicleFull } from "@orasso/shared";

import { api } from "./api.server";

export const INVITATION_INTENTS = ["invitation_accept", "invitation_decline"] as const;

export function isInvitationIntent(intent: string): boolean {
  return (INVITATION_INTENTS as readonly string[]).includes(intent);
}

/** Accepter (avec le véhicule choisi) ou refuser. Renvoie le message à afficher, ou l'erreur de l'API. */
export async function invitationAction(
  request: Request,
  form: FormData,
): Promise<{ ok: string | null; error: string | null; status: number }> {
  const intent = String(form.get("intent") ?? "");
  const id = String(form.get("invitationId") ?? "");
  if (!id) return { ok: null, error: "Invitation inconnue.", status: 400 };
  if (intent === "invitation_decline") {
    const res = await api(request, `/event-invitations/${encodeURIComponent(id)}/decline`, { method: "POST" });
    return res.ok
      ? { ok: invitationLabels.declined, error: null, status: 200 }
      : { ok: null, error: res.error.message, status: res.status };
  }
  const vehicleId = String(form.get("vehicleId") ?? "") || undefined;
  // Lot 26 : jour choisi (événement sur plusieurs jours) ; vide = tout l'événement.
  const eventDayId = String(form.get("eventDayId") ?? "") || undefined;
  const res = await api<InvitationAcceptResult>(request, `/event-invitations/${encodeURIComponent(id)}/accept`, {
    method: "POST",
    json: { ...(vehicleId ? { vehicleId } : {}), ...(eventDayId ? { eventDayId } : {}) },
  });
  if (!res.ok) return { ok: null, error: res.error.message, status: res.status };
  return {
    ok: res.data.outcome === "accepted" ? invitationLabels.accepted : invitationLabels.waitlisted,
    error: null,
    status: 200,
  };
}

/** Mes véhicules actifs (pour le choix du véhicule à l'acceptation). */
export async function myActiveVehicles(request: Request): Promise<VehicleFull[]> {
  const res = await api<VehicleFull[]>(request, "/me/vehicles");
  return res.ok ? res.data.filter((v) => v.status === "active" && !v.plateTransfer) : [];
}
