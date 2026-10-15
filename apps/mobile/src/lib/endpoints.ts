// Les routes de l'API utilisées par l'appli, typées avec `@orasso/shared`. Aucune règle métier ici : elles sont
// toutes dans l'API (CLAUDE.md).
import type {
  AccessPass,
  AccountQrSecret,
  ApplicationCreate,
  Category,
  EventCard,
  EventListQuery,
  EventPublic,
  Me,
  MyApplication,
  MyPoints,
  MyStaffEvent,
  Page,
  VehicleCreate,
  VehicleFull,
  VehicleGeneration,
  VehicleMake,
  VehicleModel,
  VehiclePhoto,
} from "@orasso/shared";

import { request, requestWithHeaders } from "./http";

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

const qs = (params: Record<string, string | number | undefined | null>) => {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
  return entries.length ? `?${entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&")}` : "";
};

export const authApi = {
  /** Connexion e-mail + mot de passe : le jeton de session revient dans l'en-tête `set-auth-token`. */
  async signIn(email: string, password: string): Promise<string> {
    const { headers } = await requestWithHeaders("/api/auth/sign-in/email", { method: "POST", body: { email, password } });
    const token = headers.get("set-auth-token");
    if (!token) throw new Error("Jeton de session absent de la réponse");
    return token;
  },
  /** Inscription : le pseudo est le champ `name` de Better Auth. */
  async signUp(email: string, password: string, pseudo: string): Promise<string> {
    const { headers } = await requestWithHeaders("/api/auth/sign-up/email", {
      method: "POST",
      body: { email, password, name: pseudo },
    });
    const token = headers.get("set-auth-token");
    if (!token) throw new Error("Jeton de session absent de la réponse");
    return token;
  },
  signOut: () => request<unknown>("/api/auth/sign-out", { method: "POST", body: {} }),
  pseudoAvailable: (pseudo: string) =>
    request<{ valid: boolean; available: boolean }>(`/api/pseudo-available${qs({ pseudo })}`),
};

export const api = {
  me: () => request<Me>("/api/me"),
  points: () => request<MyPoints>("/api/me/points"),
  accountQrSecret: () => request<AccountQrSecret>("/api/me/account-qr-secret"),
  registerDevice: (body: {
    platform: "ios" | "android" | "web";
    expoPushToken?: string | null;
    name?: string | null;
    appVersion?: string | null;
  }) => request<unknown>("/api/me/devices", { method: "POST", body }),
  notifications: (cursor?: string) => request<Page<NotificationItem>>(`/api/me/notifications${qs({ limit: 30, cursor })}`),
  markNotificationsRead: () => request<unknown>("/api/me/notifications/read", { method: "POST", body: { all: true } }),

  // Garage.
  vehicles: () => request<VehicleFull[]>("/api/me/vehicles"),
  vehicle: (id: string) => request<VehicleFull>(`/api/me/vehicles/${id}`),
  deleteVehiclePhoto: (vehicleId: string, photoId: string) =>
    request<unknown>(`/api/me/vehicles/${vehicleId}/photos/${photoId}`, { method: "DELETE" }),
  createVehicle: (body: VehicleCreate) => request<VehicleFull>("/api/me/vehicles", { method: "POST", body }),
  uploadVehiclePhoto: (vehicleId: string, form: FormData) =>
    request<VehiclePhoto>(`/api/me/vehicles/${vehicleId}/photos`, { method: "POST", form, timeout: 60_000 }),
  makes: () => request<VehicleMake[]>("/api/vehicle-reference/makes"),
  models: (makeId: string) => request<VehicleModel[]>(`/api/vehicle-reference/makes/${makeId}/models`),
  generations: (modelId: string) => request<VehicleGeneration[]>(`/api/vehicle-reference/models/${modelId}/generations`),
  categories: () => request<Category[]>("/api/vehicle-reference/categories"),

  // Événements.
  events: (query: Partial<Pick<EventListQuery, "q" | "format" | "limit" | "cursor">>) =>
    request<Page<EventCard>>(`/api/events${qs(query)}`),
  eventBySlug: (slug: string) => request<EventPublic>(`/api/events/by-slug/${encodeURIComponent(slug)}`),

  // Candidatures.
  apply: (eventId: string, body: Omit<ApplicationCreate, "rulesAccepted"> & { rulesAccepted: true }) =>
    request<MyApplication[]>(`/api/events/${eventId}/applications`, { method: "POST", body }),
  applications: (scope: "upcoming" | "past") => request<MyApplication[]>(`/api/me/applications${qs({ scope })}`),
  withdraw: (id: string) => request<MyApplication>(`/api/applications/${id}/withdraw`, { method: "POST", body: {} }),
  acceptOffer: (id: string) => request<MyApplication>(`/api/applications/${id}/offer/accept`, { method: "POST", body: {} }),
  declineOffer: (id: string) =>
    request<MyApplication>(`/api/applications/${id}/offer/decline`, { method: "POST", body: {} }),
  pass: (applicationId: string) => request<AccessPass>(`/api/applications/${applicationId}/pass`),
  contestMalus: (applicationId: string, message: string) =>
    request<unknown>(`/api/applications/${applicationId}/malus-contest`, { method: "POST", body: { message } }),

  // Staff (l'écran « Où je suis staff » ; le mode staff est au lot 10).
  staffEvents: () => request<MyStaffEvent[]>("/api/me/staff-events"),
  setPresence: (eventId: string, present: boolean) =>
    request<unknown>(`/api/events/${eventId}/staff/me/presence`, { method: "PUT", body: { present } }),
};
