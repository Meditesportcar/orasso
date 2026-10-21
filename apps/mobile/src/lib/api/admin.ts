// Administration et modération (lot 35d, décision D20) : les routes `/admin/*` que le site appelle déjà, plus le mode
// assistance et l'horloge simulée. Aucune règle métier ici : rôle (modérateur / super admin), double authentification de
// session, motifs et traces sont décidés par l'API, qui répond par un message que l'appli affiche tel quel.
import type {
  AdminAuditRow,
  AdminBadgeCounts,
  AdminBadgeRow,
  AdminCertificationRequest,
  AdminOverview,
  AdminPlateTransfer,
  AdminProRow,
  AdminReportDetail,
  AdminReportItem,
  AdminSanction,
  AdminSettingEntry,
  AdminStructureDetail,
  AdminStructureRow,
  AdminUserDetail,
  AdminUserRow,
  AssistanceRequestView,
  AssistanceState,
  ClockAdvanceResult,
  ClockEventRow,
  ClockMilestone,
  ClockStatus,
  MalusContestView,
  MediaProfileView,
  NewsletterAudience,
  NewsletterView,
  OtherVehicleGroup,
  Page,
  PlatformSettings,
  ReferenceGeneration,
  ReferenceMake,
  ReferenceModel,
  ReportReason,
  ReportStatus,
  SanctionKind,
  SponsoredPlacementAdmin,
  StructureVerification,
  TemplateKind,
  TemplateView,
} from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

/** `GET /admin/settings` : les interrupteurs de la billetterie et les réglages du lot 33. */
export type AdminSettings = PlatformSettings & { entries: AdminSettingEntry[] };

/** Une ligne du registre des structures (`GET /admin/structure-registry`). */
export type StructureRegistryRow = {
  id: string;
  slug: string;
  name: string;
  verification: StructureVerification;
  badgeExpiresAt: string | null;
  city: string | null;
  department: string | null;
  owner: { id: string; pseudo: string } | null;
  members: number;
  events: number;
  assistanceOpen: boolean;
  followerMessageQuota: number | null;
};

export type AdminAuditQuery = {
  action?: string;
  actor?: string;
  target?: string;
  from?: string;
  to?: string;
  cursor?: string;
};

export type NewsletterDraft = { subject: string; bodyMd: string };

export type PlacementCreate = {
  proProfileId: string;
  title: string;
  body: string;
  linkUrl: string;
  departments: string[];
  startsOn: string;
  endsOn: string;
  dailyCap: number | null;
  status: "draft" | "active" | "paused";
};

export type ClockAdvanceBody = { by: string } | { to: string } | { eventId: string; milestone: ClockMilestone };

export const adminApi = {
  // --- Accueil et files ---------------------------------------------------------------------------------------------
  adminOverview: () => request<AdminOverview>("/api/admin/overview"),

  adminPendingStructures: (all: boolean) =>
    request<AdminStructureRow[]>(`/api/admin/structures${qs({ status: all ? "all" : "pending" })}`),
  verifyStructure: (id: string, verified: boolean, note: string | null) =>
    request<unknown>(`/api/admin/structures/${id}/verify`, { method: "POST", body: { verified, note } }),

  adminCertifications: (all: boolean) =>
    request<AdminCertificationRequest[]>(
      `/api/admin/certification-requests${qs({ status: all ? undefined : "pending" })}`,
    ),
  decideCertification: (id: string, decision: "accept" | "refuse", note: string | null) =>
    request<unknown>(`/api/admin/certification-requests/${id}/decide`, { method: "POST", body: { decision, note } }),

  adminPlateTransfers: () => request<AdminPlateTransfer[]>("/api/admin/plate-transfers"),
  decidePlateTransfer: (id: string, decision: "accept" | "refuse", note: string | null) =>
    request<unknown>(`/api/admin/plate-transfers/${id}/decide`, { method: "POST", body: { decision, note } }),

  adminBadges: (filter: "expiring" | "suspended" | "all") =>
    request<{ items: AdminBadgeRow[]; counts: AdminBadgeCounts }>(`/api/admin/structures${qs({ badge: filter })}`),
  adminStructure: (id: string) => request<AdminStructureDetail>(`/api/admin/structures/${id}`),
  renewBadge: (id: string, note: string | null) =>
    request<unknown>(`/api/admin/structures/${id}/renew-badge`, { method: "POST", body: { note } }),
  suspendStructure: (id: string, reason: string) =>
    request<unknown>(`/api/admin/structures/${id}/suspend`, { method: "POST", body: { reason } }),
  liftStructure: (id: string, reason: string) =>
    request<unknown>(`/api/admin/structures/${id}/lift`, { method: "POST", body: { reason } }),
  transferStructureOwner: (id: string, body: { pseudo: string; reason: string; documentId: string }) =>
    request<unknown>(`/api/admin/structures/${id}/transfer-owner`, { method: "POST", body }),
  addStructureDocument: (id: string, form: FormData) =>
    request<unknown>(`/api/admin/structures/${id}/documents`, { method: "POST", form, timeout: 60_000 }),
  setStructureQuota: (id: string, followerMessageQuota: number | null, reason: string) =>
    request<unknown>(`/api/admin/structures/${id}/quota`, { method: "PATCH", body: { followerMessageQuota, reason } }),

  adminReports: (status: ReportStatus, cursor?: string) =>
    request<Page<AdminReportItem>>(`/api/admin/reports${qs({ status, cursor })}`),
  adminReport: (id: string) => request<AdminReportDetail>(`/api/admin/reports/${id}`),
  setReportStatus: (id: string, status: ReportStatus, note: string | null) =>
    request<unknown>(`/api/admin/reports/${id}/status`, { method: "POST", body: { status, note } }),
  sanctionReport: (
    id: string,
    body: { kind: SanctionKind | null; note: string | null; hideContent: boolean; subject: "owner" | "reporter" },
  ) => request<unknown>(`/api/admin/reports/${id}/sanction`, { method: "POST", body }),

  adminSanctions: (filter: "contested" | "active" | "all") =>
    request<AdminSanction[]>(`/api/admin/sanctions${qs({ filter })}`),
  decideSanction: (id: string, decision: "uphold" | "lift", note: string | null) =>
    request<unknown>(`/api/admin/sanctions/${id}/decide`, { method: "POST", body: { decision, note } }),
  liftSanction: (id: string, note: string | null) =>
    request<unknown>(`/api/admin/sanctions/${id}/lift`, { method: "POST", body: { note } }),

  adminMalusContests: () => request<MalusContestView[]>("/api/admin/malus-contests?status=escalated"),
  decideMalusContest: (id: string, body: { decision: "accept" | "reject"; note: string | null; checkin: boolean }) =>
    request<unknown>(`/api/admin/malus-contests/${id}/decide`, { method: "POST", body }),

  adminAssistance: (status: "open" | "closed") =>
    request<AssistanceRequestView[]>(`/api/admin/assistance-requests${qs({ status })}`),
  closeAssistanceAsAdmin: (id: string) =>
    request<unknown>(`/api/admin/assistance-requests/${id}/close`, { method: "POST" }),

  // --- Registres ----------------------------------------------------------------------------------------------------
  adminUsers: (q: string, cursor?: string) =>
    request<Page<AdminUserRow>>(`/api/admin/users${qs({ q: q || undefined, limit: 30, cursor })}`),
  adminUser: (id: string) => request<AdminUserDetail>(`/api/admin/users/${encodeURIComponent(id)}`),
  adjustPoints: (id: string, points: number, note: string) =>
    request<unknown>(`/api/admin/users/${encodeURIComponent(id)}/points-adjust`, {
      method: "POST",
      body: { points, note },
    }),
  sanctionUser: (id: string, body: { kind: SanctionKind; reason: ReportReason; note: string }) =>
    request<unknown>(`/api/admin/users/${encodeURIComponent(id)}/sanction`, { method: "POST", body }),
  resetTwoFactor: (id: string, reason: string) =>
    request<unknown>(`/api/admin/users/${encodeURIComponent(id)}/reset-two-factor`, {
      method: "POST",
      body: { reason },
    }),
  setUserRole: (id: string, role: "user" | "moderator", reason: string) =>
    request<unknown>(`/api/admin/users/${encodeURIComponent(id)}/role`, { method: "POST", body: { role, reason } }),
  anonymizeUser: (id: string, reason: string) =>
    request<unknown>(`/api/admin/users/${encodeURIComponent(id)}/anonymize`, { method: "POST", body: { reason } }),

  structureRegistry: (q: string) =>
    request<StructureRegistryRow[]>(`/api/admin/structure-registry${qs({ q: q || undefined })}`),

  adminPros: (filter: "to_verify" | "all", q: string) =>
    request<AdminProRow[]>(`/api/admin/pros${qs({ filter, q: q || undefined })}`),
  // Lot 57 : profils média à vérifier (D26 : vérification du profil, sans carte de presse).
  adminMedia: (pendingOnly: boolean) =>
    request<MediaProfileView[]>(`/api/admin/media${qs({ pending: pendingOnly ? "1" : "0" })}`),
  verifyMedia: (id: string, verified: boolean) =>
    request<MediaProfileView>(`/api/admin/media/${id}/verify`, { method: "POST", body: { verified } }),
  verifyPro: (id: string, verified: boolean, note: string) =>
    request<unknown>(`/api/admin/pros/${id}/verify`, { method: "POST", body: { verified, note } }),

  referenceMakes: () => request<ReferenceMake[]>("/api/admin/vehicle-reference/makes"),
  referenceModels: (makeId: string) => request<ReferenceModel[]>(`/api/admin/vehicle-reference/makes/${makeId}/models`),
  referenceGenerations: (modelId: string) =>
    request<ReferenceGeneration[]>(`/api/admin/vehicle-reference/models/${modelId}/generations`),
  referenceOthers: () => request<OtherVehicleGroup[]>("/api/admin/vehicle-reference/others"),
  createMake: (name: string, country: string | null) =>
    request<{ id: string }>("/api/admin/vehicle-reference/makes", { method: "POST", body: { name, country } }),
  createModel: (makeId: string, name: string, vehicleType: string) =>
    request<{ id: string }>("/api/admin/vehicle-reference/models", {
      method: "POST",
      body: { makeId, name, vehicleType },
    }),
  createGeneration: (modelId: string, name: string, yearFrom: number | null, yearTo: number | null) =>
    request<{ id: string }>("/api/admin/vehicle-reference/generations", {
      method: "POST",
      body: { modelId, name, yearFrom, yearTo },
    }),
  deleteMake: (id: string) => request<unknown>(`/api/admin/vehicle-reference/makes/${id}`, { method: "DELETE" }),
  reassignVehicle: (vehicleId: string, makeId: string, modelId: string, generationId: string | null) =>
    request<unknown>(`/api/admin/vehicles/${vehicleId}/reassign`, {
      method: "POST",
      body: { makeId, modelId, generationId },
    }),

  adminAudit: (query: AdminAuditQuery) =>
    request<Page<AdminAuditRow>>(`/api/admin/audit${qs({ limit: 50, ...query })}`),

  // --- Réglages -----------------------------------------------------------------------------------------------------
  adminSettings: () => request<AdminSettings>("/api/admin/settings"),
  putSetting: (key: string, value: unknown) =>
    request<AdminSettings>(`/api/admin/settings/${encodeURIComponent(key)}`, { method: "PUT", body: { value } }),
  adminTemplates: () => request<TemplateView[]>("/api/admin/message-templates"),
  createAdminTemplate: (body: { kind: TemplateKind; name: string; subject: string | null; body: string }) =>
    request<TemplateView>("/api/admin/message-templates", { method: "POST", body }),
  updateAdminTemplate: (id: string, body: { kind: TemplateKind; name: string; subject: string | null; body: string }) =>
    request<TemplateView>(`/api/admin/message-templates/${id}`, { method: "PATCH", body }),
  deleteAdminTemplate: (id: string) => request<unknown>(`/api/admin/message-templates/${id}`, { method: "DELETE" }),

  // --- Newsletter ---------------------------------------------------------------------------------------------------
  newsletters: () => request<NewsletterView[]>("/api/admin/newsletters"),
  newsletterAudience: () => request<NewsletterAudience>("/api/admin/newsletters/audience"),
  createNewsletter: (body: NewsletterDraft) =>
    request<NewsletterView>("/api/admin/newsletters", { method: "POST", body }),
  saveNewsletter: (id: string, body: NewsletterDraft) =>
    request<NewsletterView>(`/api/admin/newsletters/${id}`, { method: "PUT", body }),
  deleteNewsletter: (id: string) => request<unknown>(`/api/admin/newsletters/${id}`, { method: "DELETE" }),
  testNewsletter: (id: string) => request<unknown>(`/api/admin/newsletters/${id}/test`, { method: "POST" }),
  scheduleNewsletter: (id: string, at: string) =>
    request<unknown>(`/api/admin/newsletters/${id}/schedule`, { method: "POST", body: { at } }),
  sendNewsletterNow: (id: string, confirmRecipients: number) =>
    request<unknown>(`/api/admin/newsletters/${id}/send-now`, { method: "POST", body: { confirmRecipients } }),
  pauseNewsletter: (id: string) => request<unknown>(`/api/admin/newsletters/${id}/pause`, { method: "POST" }),
  resumeNewsletter: (id: string) => request<unknown>(`/api/admin/newsletters/${id}/resume`, { method: "POST" }),
  unscheduleNewsletter: (id: string) => request<unknown>(`/api/admin/newsletters/${id}/unschedule`, { method: "POST" }),

  // --- Emplacements sponsorisés -------------------------------------------------------------------------------------
  sponsoredPlacements: () => request<SponsoredPlacementAdmin[]>("/api/admin/sponsored-placements"),
  createPlacement: (body: PlacementCreate) =>
    request<SponsoredPlacementAdmin>("/api/admin/sponsored-placements", { method: "POST", body }),
  setPlacementStatus: (id: string, status: "draft" | "active" | "paused" | "ended") =>
    request<SponsoredPlacementAdmin>(`/api/admin/sponsored-placements/${id}`, { method: "PATCH", body: { status } }),
  deletePlacement: (id: string) => request<unknown>(`/api/admin/sponsored-placements/${id}`, { method: "DELETE" }),
  uploadPlacementImage: (id: string, form: FormData) =>
    request<unknown>(`/api/admin/sponsored-placements/${id}/image`, { method: "POST", form, timeout: 60_000 }),

  // --- Mode assistance ----------------------------------------------------------------------------------------------
  /** Ce que voit la structure (sa demande en cours, l'historique) ; pour un super admin, le mode de son survol. */
  assistanceState: (structureId: string) => request<AssistanceState>(`/api/structures/${structureId}/assistance`),
  requestAssistance: (structureId: string, message: string) =>
    request<AssistanceRequestView>(`/api/structures/${structureId}/assistance-requests`, {
      method: "POST",
      body: { message },
    }),
  closeAssistance: (requestId: string) =>
    request<unknown>(`/api/assistance-requests/${requestId}/close`, { method: "POST" }),

  // --- Horloge simulée (développement) ------------------------------------------------------------------------------
  clockStatus: () => request<ClockStatus>("/api/dev/clock"),
  clockEvents: () => request<{ items: ClockEventRow[] }>("/api/dev/clock/events"),
  clockAdvance: (body: ClockAdvanceBody) =>
    request<ClockAdvanceResult>("/api/dev/clock/advance", { method: "POST", body }),
  clockReset: () => request<ClockStatus>("/api/dev/clock/reset", { method: "POST" }),
};
