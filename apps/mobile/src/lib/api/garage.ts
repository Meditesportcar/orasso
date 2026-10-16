// Garage et référentiel des véhicules (lot 31 : page véhicule complète, certification, transfert de plaque).
import type {
  CategoryOption,
  OutgoingPlateTransferView,
  PlateTransferView,
  VehicleCertification,
  VehicleCreate,
  VehicleDetail,
  VehicleFull,
  VehicleGeneration,
  VehicleHistoryItem,
  VehicleMake,
  VehicleModel,
  VehiclePhoto,
  VehicleStatus,
} from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

export const garageApi = {
  vehicles: () => request<VehicleFull[]>("/api/me/vehicles"),
  /** Page du véhicule : fiche et état de la certification. */
  vehicle: (id: string) => request<VehicleDetail>(`/api/me/vehicles/${id}`),
  vehicleHistory: (id: string) => request<VehicleHistoryItem[]>(`/api/me/vehicles/${id}/history`),
  /** Passage en archive (vendu, souvenir, accidenté) ou retour au garage actif, avec motif facultatif. */
  setVehicleStatus: (id: string, status: VehicleStatus, statusNote?: string | null) =>
    request<VehicleFull>(`/api/me/vehicles/${id}`, {
      method: "PATCH",
      body: { status, statusNote: statusNote ?? null },
    }),
  deleteVehiclePhoto: (vehicleId: string, photoId: string) =>
    request<unknown>(`/api/me/vehicles/${vehicleId}/photos/${photoId}`, { method: "DELETE" }),
  createVehicle: (body: VehicleCreate) => request<VehicleFull>("/api/me/vehicles", { method: "POST", body }),
  uploadVehiclePhoto: (vehicleId: string, form: FormData) =>
    request<VehiclePhoto>(`/api/me/vehicles/${vehicleId}/photos`, { method: "POST", form, timeout: 60_000 }),
  makes: () => request<VehicleMake[]>("/api/vehicle-reference/makes"),
  models: (makeId: string) => request<VehicleModel[]>(`/api/vehicle-reference/makes/${makeId}/models`),
  generations: (modelId: string) =>
    request<VehicleGeneration[]>(`/api/vehicle-reference/models/${modelId}/generations`),
  /** Catégories ; avec marque, type et année : chacune dit si elle convient et pourquoi sinon. */
  categories: (filter: { makeId?: string; vehicleType?: string; year?: number } = {}) =>
    request<CategoryOption[]>(`/api/vehicle-reference/categories${qs(filter)}`),
  requestCertification: (vehicleId: string, message?: string | null) =>
    request<VehicleCertification>(`/api/me/vehicles/${vehicleId}/certification-request`, {
      method: "POST",
      body: { message: message ?? null },
    }),
  /** Demandes de transfert de plaque reçues (je suis l'ancien propriétaire) et envoyées. */
  plateTransfers: () =>
    request<{ incoming: PlateTransferView[]; outgoing: OutgoingPlateTransferView[] }>("/api/me/plate-transfers"),
  acceptPlateTransfer: (id: string) => request<{ ok: true }>(`/api/plate-transfers/${id}/accept`, { method: "POST" }),
  declinePlateTransfer: (id: string) => request<{ ok: true }>(`/api/plate-transfers/${id}/decline`, { method: "POST" }),
};
