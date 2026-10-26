// Styles des véhicules (lot R5a, maquettes R5.2 et R5.3) : « Propose-le », et le catalogue des styles de la casquette
// Administration (même contenu que le site, en une colonne).
import type {
  AdminCategory,
  AdminCategoryCreate,
  AdminCategoryUpdate,
  AdminStyleAccept,
  AdminStyleProposalGroup,
  CategoryProposalResult,
  VehicleType,
} from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

export type StyleProposalPage = { items: AdminStyleProposalGroup[]; total: number; nextCursor: string | null };

export const stylesApi = {
  /** « Il manque un style ? Propose-le » ; `vehicleId` : le véhicule de la personne (modification). */
  proposeStyle: (body: { label: string; vehicleType: VehicleType; vehicleId?: string }) =>
    request<CategoryProposalResult>("/api/categories/proposals", { method: "POST", body }),
  adminCategories: () => request<AdminCategory[]>("/api/admin/categories"),
  createCategory: (body: AdminCategoryCreate) =>
    request<{ id: string; created: boolean }>("/api/admin/categories", { method: "POST", body }),
  updateCategory: (id: string, body: AdminCategoryUpdate) =>
    request<AdminCategory>(`/api/admin/categories/${id}`, { method: "PATCH", body }),
  orderCategories: (vehicleType: VehicleType, ids: string[]) =>
    request<{ count: number }>("/api/admin/categories/order", { method: "PATCH", body: { vehicleType, ids } }),
  styleProposals: (cursor?: string | null) =>
    request<StyleProposalPage>(`/api/admin/category-proposals${qs({ cursor: cursor ?? undefined })}`),
  acceptStyle: (key: string, body: AdminStyleAccept) =>
    request<{ categoryId: string; count: number; applied: number }>(
      `/api/admin/category-proposals/${encodeURIComponent(key)}/accept`,
      { method: "POST", body },
    ),
  mergeStyle: (key: string, body: { version: string; categoryId: string }) =>
    request<{ categoryId: string; count: number; applied: number }>(
      `/api/admin/category-proposals/${encodeURIComponent(key)}/merge`,
      { method: "POST", body },
    ),
  declineStyle: (key: string, version: string) =>
    request<{ count: number }>(`/api/admin/category-proposals/${encodeURIComponent(key)}/decline`, {
      method: "POST",
      body: { version },
    }),
};
