// Casquette Pro (lots 14 et 35c) : lecteur de QR de compte, publications, statistiques, fiche (modification, logo,
// photos, SIRET, remises, partenaires). Aucun paiement dans l'appli : l'abonnement se consulte, il se souscrit sur le site.
import type {
  AccountQrVerify,
  ProDiscountsInput,
  ProOwner,
  ProPostCreate,
  ProPostUpdate,
  ProPostView,
  ProStats,
  ProUpdate,
} from "@orasso/shared";

import { request } from "../http";

export const prosApi = {
  myPro: () => request<ProOwner | null>("/api/me/pro"),
  verifyAccountQr: (payload: string) =>
    request<AccountQrVerify>("/api/account-qr/verify", { method: "POST", body: { payload } }),
  createProPost: (proId: string, body: ProPostCreate) =>
    request<ProPostView>(`/api/pros/${proId}/posts`, { method: "POST", body }),
  updateProPost: (proId: string, postId: string, body: ProPostUpdate) =>
    request<ProPostView>(`/api/pros/${proId}/posts/${postId}`, { method: "PATCH", body }),
  deleteProPost: (proId: string, postId: string) =>
    request<unknown>(`/api/pros/${proId}/posts/${postId}`, { method: "DELETE" }),
  proStats: (proId: string, days = 30) => request<ProStats>(`/api/pros/${proId}/stats?days=${days}`),
  // Fiche (lot 35c) : mêmes routes que l'espace pro du site.
  updatePro: (proId: string, body: ProUpdate) => request<ProOwner>(`/api/pros/${proId}`, { method: "PATCH", body }),
  setProPublished: (proId: string, published: boolean) =>
    request<ProOwner>(`/api/pros/${proId}/published`, { method: "PUT", body: { published } }),
  checkProSiret: (proId: string, number: string) =>
    request<ProOwner>(`/api/pros/${proId}/siret/check`, { method: "POST", body: { number } }),
  uploadProLogo: (proId: string, form: FormData) =>
    request<unknown>(`/api/pros/${proId}/logo`, { method: "POST", form, timeout: 60_000 }),
  addProPhoto: (proId: string, form: FormData) =>
    request<unknown>(`/api/pros/${proId}/photos`, { method: "POST", form, timeout: 60_000 }),
  removeProPhoto: (proId: string, photoId: string) =>
    request<unknown>(`/api/pros/${proId}/photos/${photoId}`, { method: "DELETE" }),
  setProDiscounts: (proId: string, body: ProDiscountsInput) =>
    request<ProOwner>(`/api/pros/${proId}/discounts`, { method: "PUT", body }),
  requestProPartner: (proId: string, structureSlug: string) =>
    request<unknown>(`/api/pros/${proId}/partners`, { method: "POST", body: { structureSlug } }),
  removeProPartner: (proId: string, structureSlug: string) =>
    request<unknown>(`/api/pros/${proId}/partners/${encodeURIComponent(structureSlug)}`, { method: "DELETE" }),
};
