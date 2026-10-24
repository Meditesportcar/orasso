// Compte : profil, points, QR de compte, appareils, Journal.
import type { AccountQrSecret, Me, MyPoints, Page } from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

export type NotificationItem = {
  id: string;
  type: string;
  family: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  eventId: string | null;
  createdAt: string;
  readAt: string | null;
};

export const accountApi = {
  me: () => request<Me>("/api/me"),
  points: () => request<MyPoints>("/api/me/points"),
  accountQrSecret: () => request<AccountQrSecret>("/api/me/account-qr-secret"),
  registerDevice: (body: {
    platform: "ios" | "android" | "web";
    expoPushToken?: string | null;
    name?: string | null;
    appVersion?: string | null;
  }) => request<{ id: string }>("/api/me/devices", { method: "POST", body }),
  /** Lot M6, tour 3 : retire le jeton push de cet appareil pour le compte connecté (déconnexion). */
  unregisterDevice: (body: { expoPushToken: string }) =>
    request<unknown>("/api/me/devices/unregister", { method: "POST", body, timeout: 5_000 }),
  /** Lot M6, tour 4 : même retrait sans session, sur preuve du jeton (déconnexion hors ligne rejouée). */
  /**
   * Lot C7 : révoque une session par son jeton (déconnexion faite hors ligne, rejouée plus tard ; la session ouverte
   * depuis, s'il y en a une, n'est pas touchée : l'en-tête donné prime sur celui de la session courante).
   */
  revokeSession: (token: string) =>
    request<unknown>("/api/auth/sign-out", { method: "POST", body: {}, headers: { authorization: `Bearer ${token}` } }),
  forgetPushToken: (body: { expoPushToken: string }) =>
    request<unknown>("/api/devices/unregister", { method: "POST", body, timeout: 5_000 }),
  notifications: (cursor?: string) =>
    request<Page<NotificationItem>>(`/api/me/notifications${qs({ limit: 30, cursor })}`),
  markNotificationsRead: () => request<unknown>("/api/me/notifications/read", { method: "POST", body: { all: true } }),
  /** Lot C2a : seulement les notifications affichées (« Tout » de la Boîte). */
  markNotificationsReadIds: (ids: string[]) =>
    request<unknown>("/api/me/notifications/read", { method: "POST", body: { ids } }),
};
