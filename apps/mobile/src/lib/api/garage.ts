// Garage et référentiel des véhicules (lot 31 : page véhicule complète, certification, transfert de plaque).
import type {
  CategoryOption,
  OutgoingPlateTransferView,
  PlateRect,
  PlateTransferView,
  ShareFormat,
  ShareStyle,
  ShareZone,
  VehicleCertification,
  VehicleCreate,
  VehicleDetail,
  VehicleFull,
  VehicleGeneration,
  VehicleHistoryItem,
  VehicleMake,
  VehicleModel,
  VehiclePros,
  VehicleReferenceHit,
  VehicleStatus,
  VehicleUpdate,
} from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

export const garageApi = {
  vehicles: () => request<VehicleFull[]>("/api/me/vehicles"),
  /** Page du véhicule : fiche et état de la certification. */
  vehicle: (id: string) => request<VehicleDetail>(`/api/me/vehicles/${id}`),
  vehicleHistory: (id: string) => request<VehicleHistoryItem[]>(`/api/me/vehicles/${id}/history`),
  /** Lot M5 : « Pour ta … » du Garage (pros partenaires, sponsorisé lié au véhicule ; jamais gardé en cache). */
  vehiclePros: (id: string) => request<VehiclePros>(`/api/me/vehicles/${id}/pros`),
  /** Passage en archive (vendu, souvenir, accidenté) ou retour au garage actif, avec motif facultatif. */
  setVehicleStatus: (id: string, status: VehicleStatus, statusNote?: string | null) =>
    request<VehicleFull>(`/api/me/vehicles/${id}`, {
      method: "PATCH",
      body: { status, statusNote: statusNote ?? null },
    }),
  /** Modification de la fiche (lot 35c) ; une plaque déjà prise par un autre membre ouvre une demande de transfert. */
  updateVehicle: (id: string, body: VehicleUpdate) =>
    request<VehicleFull>(`/api/me/vehicles/${id}`, { method: "PATCH", body }),
  /** Suppression définitive (impossible si le véhicule a déjà participé à un événement : l'API répond 409). */
  deleteVehicle: (id: string) => request<unknown>(`/api/me/vehicles/${id}`, { method: "DELETE" }),
  deleteVehiclePhoto: (vehicleId: string, photoId: string) =>
    request<VehicleFull>(`/api/me/vehicles/${vehicleId}/photos/${photoId}`, { method: "DELETE" }),
  /** Ordre des photos (lot 36 : la première est la couverture de la carte du véhicule). */
  reorderVehiclePhotos: (vehicleId: string, photoIds: string[]) =>
    request<VehicleFull>(`/api/me/vehicles/${vehicleId}/photos/order`, { method: "PUT", body: { photoIds } }),
  createVehicle: (body: VehicleCreate) => request<VehicleFull>("/api/me/vehicles", { method: "POST", body }),
  /**
   * Lot 51 : `plateRects` (JSON) = plaque floutée par l'API avant le stockage ; lot M1, tour 2 : sinon `noPlate=true`
   * (« aucune plaque visible » confirmé). L'API refuse une photo sans l'un ni l'autre.
   */
  uploadVehiclePhoto: (vehicleId: string, form: FormData) =>
    request<VehicleFull>(`/api/me/vehicles/${vehicleId}/photos`, { method: "POST", form, timeout: 60_000 }),
  /** Floute la plaque d'une photo déjà en ligne (lot 51) : définitif, l'originale n'est gardée nulle part. */
  blurVehiclePhoto: (vehicleId: string, photoId: string, rects: PlateRect[]) =>
    request<VehicleFull>(`/api/me/vehicles/${vehicleId}/photos/${photoId}/blur`, {
      method: "POST",
      body: { rects },
      timeout: 60_000,
    }),
  /** Lot R3a, tour 2 : zones des textes d'Orasso sur l'affiche (écartées de la vérification de plaque). */
  shareZones: (vehicleId: string, format: ShareFormat, style: ShareStyle) =>
    request<{ texts: ShareZone[] }>(`/api/me/vehicles/${vehicleId}/share-zones?format=${format}&style=${style}`),
  makes: () => request<VehicleMake[]>("/api/vehicle-reference/makes"),
  /** Lot R4a : recherche « Marque ou modèle » tolérante du lot R3c (« golf 4 », « e36 », « mx5 »). */
  referenceSearch: (q: string, type?: string) =>
    request<VehicleReferenceHit[]>(`/api/vehicle-reference/search${qs({ q, type, limit: 20 })}`),
  models: (makeId: string) => request<VehicleModel[]>(`/api/vehicle-reference/makes/${makeId}/models`),
  generations: (modelId: string) =>
    request<VehicleGeneration[]>(`/api/vehicle-reference/models/${modelId}/generations`),
  /**
   * Catégories ; avec marque, type et année : chacune dit si elle convient et pourquoi sinon. Lot M1, tour 2 : le
   * modèle dit s'il est tout-terrain (« 4x4 »).
   */
  categories: (
    filter: {
      makeId?: string;
      modelId?: string;
      vehicleType?: string;
      year?: number;
      /** Lot R5a, tour 2 : les styles en pause aussi (`paused: true`), pour garder les choix déjà faits. */
      paused?: "1";
    } = {},
  ) => request<CategoryOption[]>(`/api/vehicle-reference/categories${qs(filter)}`),
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
