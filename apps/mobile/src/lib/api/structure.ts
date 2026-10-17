// Structure et équipe, casquette Organisateur (lot 35a, décision D20) : la fiche, le logo, la vérification, les
// partenaires, les membres et les demandes de staff, les bannissements, les modèles de message et les notes internes.
// Ce sont les routes que le site appelle déjà (`orga-staff`, `orga-structure`, `orga-communication`). Aucune règle
// métier ici : droits, suspension et double authentification sont décidés par l'API, qui répond par un message.
import type {
  MemberInvite,
  MemberUpdate,
  StaffRequestAccept,
  StructureNoteView,
  StructureOrganizer,
  StructurePartnerRow,
  StructureUpdate,
  StructureVerificationView,
  TemplateCreate,
  TemplateView,
  VerificationDocument,
} from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

/** Une personne bannie des événements de la structure (`GET /structures/:id/bans`). */
export type StructureBan = { userId: string; pseudo: string; reason: string | null; at: string };

export const structureApi = {
  // Fiche et logo.
  orgStructure: (structureId: string) => request<StructureOrganizer>(`/api/structures/${structureId}`),
  updateStructure: (structureId: string, body: StructureUpdate) =>
    request<unknown>(`/api/structures/${structureId}`, { method: "PATCH", body }),
  uploadLogo: (structureId: string, form: FormData) =>
    request<unknown>(`/api/structures/${structureId}/logo`, { method: "POST", form, timeout: 60_000 }),

  // Vérification et badge.
  verification: (structureId: string) =>
    request<StructureVerificationView>(`/api/structures/${structureId}/verification`),
  checkRegistry: (structureId: string, number: string) =>
    request<StructureVerificationView>(`/api/structures/${structureId}/verification/check`, {
      method: "POST",
      body: { number },
      timeout: 30_000,
    }),
  addVerificationDocument: (structureId: string, form: FormData) =>
    request<VerificationDocument>(`/api/structures/${structureId}/verification/documents`, {
      method: "POST",
      form,
      timeout: 60_000,
    }),
  removeVerificationDocument: (structureId: string, documentId: string) =>
    request<unknown>(`/api/structures/${structureId}/verification/documents/${documentId}`, { method: "DELETE" }),
  submitVerification: (structureId: string) =>
    request<unknown>(`/api/structures/${structureId}/verification/submit`, { method: "POST" }),

  // Partenaires.
  partners: (structureId: string) => request<StructurePartnerRow[]>(`/api/structures/${structureId}/partners`),
  acceptPartner: (structureId: string, proSlug: string) =>
    request<unknown>(`/api/structures/${structureId}/partners/${encodeURIComponent(proSlug)}`, { method: "PUT" }),
  dropPartner: (structureId: string, proSlug: string) =>
    request<unknown>(`/api/structures/${structureId}/partners/${encodeURIComponent(proSlug)}`, { method: "DELETE" }),

  // Membres et demandes de staff (la liste : `structureMembers`, orga.ts).
  inviteMember: (structureId: string, body: MemberInvite) =>
    request<unknown>(`/api/structures/${structureId}/members`, { method: "POST", body }),
  updateMember: (structureId: string, userId: string, body: MemberUpdate) =>
    request<unknown>(`/api/structures/${structureId}/members/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body,
    }),
  removeMember: (structureId: string, userId: string) =>
    request<unknown>(`/api/structures/${structureId}/members/${encodeURIComponent(userId)}`, { method: "DELETE" }),
  acceptStaffRequest: (structureId: string, userId: string, body: Partial<StaffRequestAccept> = {}) =>
    request<unknown>(`/api/structures/${structureId}/members/${encodeURIComponent(userId)}/accept`, {
      method: "POST",
      body,
    }),
  declineStaffRequest: (structureId: string, userId: string) =>
    request<unknown>(`/api/structures/${structureId}/members/${encodeURIComponent(userId)}/decline`, {
      method: "POST",
    }),
  /** « Relancer » tous ceux qui n'ont pas répondu à un événement (un seul : `remindStaff`, orga.ts). */
  remindAllStaff: (eventId: string) =>
    request<{ reminded: number }>(`/api/events/${eventId}/staff/remind`, { method: "POST", body: {} }),

  // Bannissements.
  bans: (structureId: string) => request<StructureBan[]>(`/api/structures/${structureId}/bans`),
  ban: (structureId: string, pseudo: string, reason: string | null) =>
    request<unknown>(`/api/structures/${structureId}/bans`, { method: "POST", body: { pseudo, reason } }),
  unban: (structureId: string, userId: string) =>
    request<unknown>(`/api/structures/${structureId}/bans/${encodeURIComponent(userId)}`, { method: "DELETE" }),

  // Modèles de message (la liste : `templates`, orga.ts).
  createTemplate: (structureId: string, body: TemplateCreate) =>
    request<TemplateView>(`/api/structures/${structureId}/templates`, { method: "POST", body }),
  updateTemplate: (structureId: string, templateId: string, body: Partial<TemplateCreate>) =>
    request<TemplateView>(`/api/structures/${structureId}/templates/${templateId}`, { method: "PATCH", body }),
  deleteTemplate: (structureId: string, templateId: string) =>
    request<unknown>(`/api/structures/${structureId}/templates/${templateId}`, { method: "DELETE" }),

  // Notes internes (privées à la structure).
  notes: (structureId: string, query: { q?: string; userId?: string; limit?: number } = {}) =>
    request<{ items: StructureNoteView[] }>(`/api/structures/${structureId}/notes${qs(query)}`),
  createNote: (structureId: string, body: { pseudo: string; eventId?: string; body: string }) =>
    request<StructureNoteView>(`/api/structures/${structureId}/notes`, { method: "POST", body }),
  updateNote: (noteId: string, body: string) =>
    request<StructureNoteView>(`/api/structure-notes/${noteId}`, { method: "PATCH", body: { body } }),
  deleteNote: (noteId: string) => request<unknown>(`/api/structure-notes/${noteId}`, { method: "DELETE" }),
};
