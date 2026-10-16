// Staff : « Où je suis staff » et mode staff hors ligne (lot 10).
import type { MyStaffEvent, PublicSigningKey, ScanBatchResult, ScanReport, StaffSync } from "@orasso/shared";

import { request } from "../http";
import type { BatchItemWire } from "../staff/model";
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
  /** Délai court (4,5 s) : à l'entrée, sans réponse vite, la demande part en file plutôt que de faire attendre. */
  expressInvite: (eventId: string, email: string, timeout = 4_500) =>
    request<{ id: string; email: string; expiresAt: string; url: string }>(`/api/events/${eventId}/express-invites`, {
      method: "POST",
      body: { email },
      timeout,
    }),
  staffAlert: (eventId: string, body: { clientId: string; message?: string | null }) =>
    request<unknown>(`/api/events/${eventId}/alerts`, { method: "POST", body }),
  incident: (
    eventId: string,
    body: { clientId: string; occurredAt: string; location?: string | null; description: string },
  ) => request<unknown>(`/api/events/${eventId}/incidents`, { method: "POST", body }),
  scanReport: (eventId: string) => request<ScanReport>(`/api/events/${eventId}/scan-report`),
};
