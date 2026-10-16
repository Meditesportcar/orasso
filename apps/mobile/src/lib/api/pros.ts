// Casquette Pro (lot 14) : lecteur de QR de compte, publications, statistiques. Aucun paiement dans l'appli.
import type { AccountQrVerify, ProOwner, ProPostCreate, ProPostView, ProStats } from "@orasso/shared";

import { request } from "../http";

export const prosApi = {
  myPro: () => request<ProOwner | null>("/api/me/pro"),
  verifyAccountQr: (payload: string) =>
    request<AccountQrVerify>("/api/account-qr/verify", { method: "POST", body: { payload } }),
  createProPost: (proId: string, body: ProPostCreate) =>
    request<ProPostView>(`/api/pros/${proId}/posts`, { method: "POST", body }),
  proStats: (proId: string, days = 30) => request<ProStats>(`/api/pros/${proId}/stats?days=${days}`),
};
