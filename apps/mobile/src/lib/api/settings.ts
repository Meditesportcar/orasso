// Moi (lot 16) : profil, aperçu public, réglages regroupés, appareils connectés, QR de compte, suppression du compte.
import type {
  AccountDelete,
  AccountQrSecret,
  AccountSettings,
  AccountSettingsUpdate,
  Me,
  Page,
  ProfileUpdate,
  PublicPreview,
  SessionView,
  StructureCard,
  StructurePublic,
} from "@orasso/shared";

import { request } from "../http";

export const settingsApi = {
  settings: () => request<AccountSettings>("/api/me/settings"),
  updateSettings: (body: AccountSettingsUpdate) =>
    request<AccountSettings>("/api/me/settings", { method: "PATCH", body }),
  publicPreview: () => request<PublicPreview>("/api/me/public-preview"),
  updateProfile: (body: ProfileUpdate) => request<Me>("/api/me/profile", { method: "PATCH", body }),
  uploadAvatar: (form: FormData) =>
    request<{ avatarUrl: string }>("/api/me/avatar", { method: "POST", form, timeout: 60_000 }),
  resendVerification: () => request<unknown>("/api/me/email/resend-verification", { method: "POST" }),
  sessions: () => request<SessionView[]>("/api/me/sessions"),
  revokeSession: (id: string) => request<unknown>(`/api/me/sessions/${id}`, { method: "DELETE" }),
  rotateAccountQrSecret: () => request<AccountQrSecret>("/api/me/account-qr-secret/rotate", { method: "POST" }),
  /** Structures vérifiées (« Devenir staff ») : la recherche se fait sur l'appareil, la liste est courte. */
  verifiedStructures: () => request<Page<StructureCard>>("/api/structures?limit=100"),
  structureBySlug: (slug: string) => request<StructurePublic>(`/api/structures/by-slug/${slug}`),
  /** Route du lot 24 (404 face à une API plus ancienne : l'appli renvoie alors vers la page de la structure du site). */
  requestStaff: (structureId: string, message?: string) =>
    request<unknown>(`/api/structures/${structureId}/staff-requests`, { method: "POST", body: { message } }),
  deleteAccount: (body: Pick<AccountDelete, "password" | "totpCode">) =>
    request<unknown>("/api/me", { method: "DELETE", body }),
};
