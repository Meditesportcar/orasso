// Staff : « Où je suis staff » et mode staff hors ligne (lot 10) ; rôle boutique, position de l'alerte et photo de la
// main courante (lot 24).
import type {
  MyStaffEvent,
  PublicSigningKey,
  ScanBatchResult,
  ScanReport,
  StaffInvitationView,
  StaffSync,
  TicketScanResultView,
  UploadResult,
  VisitorEntriesResult,
} from "@orasso/shared";

import { request } from "../http";
import type { BatchItemWire, TicketScanWire, VisitorItemWire } from "../staff/model";
import { qs } from "./qs";

export const staffApi = {
  staffEvents: () => request<MyStaffEvent[]>("/api/me/staff-events"),
  setPresence: (eventId: string, present: boolean) =>
    request<unknown>(`/api/events/${eventId}/staff/me/presence`, { method: "PUT", body: { present } }),
  /** Clés publiques de vérification des QR (appel séparé de la synchro : clés de confiance). */
  signingKeys: () => request<{ keys: PublicSigningKey[] }>("/api/keys"),
  staffSync: (eventId: string, since?: string | null) =>
    request<StaffSync>(`/api/events/${eventId}/staff/sync${qs({ since })}`, { timeout: 30_000 }),
  sendScans: (eventId: string, batch: { deviceId: string; items: BatchItemWire[] }) =>
    request<{ results: ScanBatchResult[] }>(`/api/events/${eventId}/scans`, {
      method: "POST",
      body: batch,
      headers: { "x-device-id": batch.deviceId },
      timeout: 30_000,
    }),
  /** Rôle boutique : un lot de billets du public lus hors ligne (idempotent par identifiant). */
  sendTicketScans: (eventId: string, batch: { deviceId: string; items: TicketScanWire[] }) =>
    request<{ results: TicketScanResultView[] }>(`/api/events/${eventId}/ticket-scans`, {
      method: "POST",
      body: batch,
      timeout: 30_000,
    }),
  /** Rôle boutique : touchers du compteur d'entrées des visiteurs (idempotent par identifiant). */
  sendVisitorEntries: (eventId: string, batch: { deviceId: string; items: VisitorItemWire[] }) =>
    request<VisitorEntriesResult>(`/api/events/${eventId}/visitor-entries`, {
      method: "POST",
      body: batch,
      timeout: 30_000,
    }),
  /** Délai court (4,5 s) : à l'entrée, sans réponse vite, la demande part en file plutôt que de faire attendre. */
  expressInvite: (eventId: string, email: string, timeout = 4_500) =>
    request<{ id: string; email: string; expiresAt: string; url: string }>(`/api/events/${eventId}/express-invites`, {
      method: "POST",
      body: { email },
      timeout,
    }),
  /** Alerte : la position (facultative) n'est lue qu'au moment où le staff touche le bouton, jamais gardée ensuite. */
  staffAlert: (
    eventId: string,
    body: { clientId: string; message?: string | null; lat?: number | null; lng?: number | null },
  ) => request<unknown>(`/api/events/${eventId}/alerts`, { method: "POST", body }),
  incident: (
    eventId: string,
    body: { clientId: string; occurredAt: string; location?: string | null; description: string },
  ) => request<unknown>(`/api/events/${eventId}/incidents`, { method: "POST", body }),
  /** Photo d'un incident : envoi du fichier (`purpose=incident`) puis rattachement à l'incident (clientId). */
  uploadIncidentPhoto: (form: FormData) =>
    request<UploadResult>("/api/me/uploads", { method: "POST", form, timeout: 60_000 }),
  attachIncidentPhoto: (eventId: string, incidentRef: string, photoKey: string) =>
    request<unknown>(`/api/events/${eventId}/incidents/${incidentRef}`, { method: "PATCH", body: { photoKey } }),
  scanReport: (eventId: string) => request<ScanReport>(`/api/events/${eventId}/scan-report`),
  /** Invitations à rejoindre une structure (Boîte > Demandes) : accepter ou refuser. */
  staffInvitations: () => request<StaffInvitationView[]>("/api/me/staff-invitations"),
  answerStaffInvitation: (structureId: string, accept: boolean) =>
    request<unknown>(`/api/me/memberships/${structureId}/${accept ? "accept" : "decline"}`, { method: "POST" }),
};
