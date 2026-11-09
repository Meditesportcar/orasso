// Partenariats pro ↔ passionné (lot R7m1) : proposer (pro), répondre et mettre fin (passionné), mes partenaires. Aucune règle
// ici : qui peut proposer, qui voit quoi, c'est l'API.
import type { MyPartnerships, PartnershipPropose, PartnershipResult, ProPartnerships } from "@orasso/shared";

import { request } from "../http";

export const partnershipsApi = {
  /** Mes partenaires actifs (je suis le passionné) : la ligne « Partenaires » de mon profil. */
  myPartnerships: () => request<MyPartnerships>("/api/me/partnerships"),
  acceptPartnership: (id: string) =>
    request<PartnershipResult>(`/api/me/partnerships/${id}/accept`, { method: "POST" }),
  declinePartnership: (id: string) =>
    request<PartnershipResult>(`/api/me/partnerships/${id}/decline`, { method: "POST" }),
  endPartnership: (id: string) => request<PartnershipResult>(`/api/me/partnerships/${id}/end`, { method: "POST" }),
  /** Côté pro (titulaire de la fiche) : mes propositions en attente et mes partenaires. */
  proPartnerships: (proId: string) => request<ProPartnerships>(`/api/pros/${proId}/partnerships`),
  proposePartnership: (proId: string, body: PartnershipPropose) =>
    request<PartnershipResult>(`/api/pros/${proId}/partnerships`, { method: "POST", body }),
  endPartnershipAsPro: (proId: string, id: string) =>
    request<PartnershipResult>(`/api/pros/${proId}/partnerships/${id}/end`, { method: "POST" }),
};
