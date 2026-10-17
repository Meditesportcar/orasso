// Tri des candidatures (lot 23) : les routes de tri du site, telles quelles. Aucune règle métier ici (capacité, liste
// d'attente, délais, verrouillage) : l'API tranche et l'appli affiche ce qu'elle répond.
import type {
  ApplicationForTriage,
  ApplicationKind,
  ApplicationStatus,
  EventCounters,
  EventCrewFilter,
  Page,
  RefusalReason,
  TriageDecision,
} from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

/** Filtres de la liste (mode liste) : ceux de `triageQuerySchema`. */
export type TriageListQuery = {
  kind: ApplicationKind;
  status?: ApplicationStatus;
  sort?: "created_at" | "waitlist_rank" | "year" | "pseudo";
  categoryId?: string;
  makeId?: string;
  country?: string;
  yearFrom?: number;
  yearTo?: number;
  grade?: string;
  crewId?: string;
  /** Lot 34 : un jour (id) ou `whole` (tout l'événement), comme le filtre « Jour » du site. */
  dayId?: string;
  q?: string;
  cursor?: string | null;
  limit?: number;
};

/** Corps de `decide` / `decide-many` (les champs facultatifs de `decideSchema` restent facultatifs). */
export type DecideBody = {
  decision: TriageDecision;
  reasons?: RefusalReason[];
  note?: string | null;
  sendReasons?: boolean;
  zoneId?: string | null;
};

export type DecideManyResult = { id: string; ok: boolean; status?: ApplicationStatus; error?: string };

export const triageApi = {
  triagePage: (eventId: string, query: TriageListQuery) =>
    request<Page<ApplicationForTriage>>(
      `/api/events/${eventId}/applications${qs({ ...query, cursor: query.cursor ?? undefined, limit: query.limit ?? 20 })}`,
    ),
  triageCounters: (eventId: string) => request<EventCounters>(`/api/events/${eventId}/counters`),
  triageCrews: (eventId: string) => request<EventCrewFilter[]>(`/api/events/${eventId}/applications/crews`),
  triageDecide: (eventId: string, applicationId: string, body: DecideBody) =>
    request<unknown>(`/api/events/${eventId}/applications/${applicationId}/decide`, { method: "POST", body }),
  triageDecideMany: (eventId: string, body: Omit<DecideBody, "zoneId"> & { ids: string[] }) =>
    request<{ results: DecideManyResult[] }>(`/api/events/${eventId}/applications/decide-many`, {
      method: "POST",
      body,
      timeout: 60_000,
    }),
  triageWaitlistOrder: (eventId: string, applicationIds: string[]) =>
    request<null>(`/api/events/${eventId}/waitlist/order`, { method: "PUT", body: { applicationIds } }),
  triageAssignZone: (eventId: string, applicationId: string, zoneId: string | null) =>
    request<null>(`/api/events/${eventId}/applications/${applicationId}/zone`, { method: "PATCH", body: { zoneId } }),
};
