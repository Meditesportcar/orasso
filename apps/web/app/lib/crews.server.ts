// Actions des crews du site (lot 19), partagées par la fiche d'un crew, « Mes crews », la Boîte et l'onglet Accès : un
// formulaire POST par action, l'intention est dans le champ `intent`.
import { data } from "react-router";

import { api } from "./api.server";

export const CREW_INTENTS = [
  "crew_request",
  "crew_request_cancel",
  "crew_request_accept",
  "crew_request_decline",
  "crew_invite",
  "crew_invitation_accept",
  "crew_invitation_decline",
  "crew_invitation_cancel",
  "crew_leave",
  "crew_remove",
  "crew_confirm",
  "crew_not_coming",
] as const;

export function isCrewIntent(intent: string): boolean {
  return (CREW_INTENTS as readonly string[]).includes(intent);
}

export type CrewActionData = { crewError: string | null; crewOk?: string | null };

const enc = encodeURIComponent;

/** Exécute l'action de crew du formulaire ; `{crewError}` (null si tout va bien) et un message de confirmation. */
export async function crewAction(request: Request, form: FormData) {
  const intent = String(form.get("intent") ?? "");
  const crewId = enc(String(form.get("crewId") ?? ""));
  const userId = enc(String(form.get("userId") ?? ""));
  const applicationId = enc(String(form.get("applicationId") ?? ""));
  let res: Awaited<ReturnType<typeof api>>;
  let ok: string | null = null;
  switch (intent) {
    case "crew_request":
      res = await api(request, `/crews/${crewId}/requests`, {
        method: "POST",
        json: { message: String(form.get("message") ?? "") || null },
      });
      ok = "Demande envoyée";
      break;
    case "crew_request_cancel":
    case "crew_leave":
    case "crew_remove":
    case "crew_invitation_cancel":
      res = await api(request, `/crews/${crewId}/members/${userId}`, { method: "DELETE" });
      break;
    case "crew_request_accept":
      res = await api(request, `/crews/${crewId}/requests/${userId}/accept`, { method: "POST" });
      break;
    case "crew_request_decline":
      res = await api(request, `/crews/${crewId}/requests/${userId}/decline`, { method: "POST" });
      break;
    case "crew_invite":
      res = await api(request, `/crews/${crewId}/invitations`, {
        method: "POST",
        json: { pseudo: String(form.get("pseudo") ?? "").trim() },
      });
      ok = res.ok ? `Invitation envoyée à ${String(form.get("pseudo") ?? "").trim()}` : null;
      break;
    case "crew_invitation_accept":
      res = await api(request, `/me/crew-invitations/${crewId}/accept`, { method: "POST" });
      break;
    case "crew_invitation_decline":
      res = await api(request, `/me/crew-invitations/${crewId}/decline`, { method: "POST" });
      break;
    case "crew_confirm":
      if (form.get("rules") !== "on") {
        return data<CrewActionData>({ crewError: "Coche « J'ai lu le règlement de l'événement »." }, { status: 400 });
      }
      res = await api(request, `/applications/${applicationId}/confirm-crew`, {
        method: "POST",
        json: {
          rulesAccepted: true,
          followStructure: form.get("follow") === "on",
          // Lot 47 : « J'ai vu » l'horaire d'arrivée des exposants (l'API l'ignore sans créneau).
          arrivalSeen: form.get("arrivalSeen") === "on",
          arrivalNote: String(form.get("arrivalNote") ?? "").trim() || null,
        },
      });
      ok = "Venue confirmée : ta candidature part à l'équipe organisatrice.";
      break;
    case "crew_not_coming":
      res = await api(request, `/applications/${applicationId}/decline-crew`, { method: "POST" });
      ok = "C'est noté : tu n'es pas inscrit.";
      break;
    default:
      return data<CrewActionData>({ crewError: "Action inconnue." }, { status: 400 });
  }
  if (!res.ok) return data<CrewActionData>({ crewError: res.error.message }, { status: res.status });
  return data<CrewActionData>({ crewError: null, crewOk: ok });
}
