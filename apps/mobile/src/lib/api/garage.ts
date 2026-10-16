// Garage et référentiel des véhicules.
import type {
  Category,
  VehicleCreate,
  VehicleFull,
  VehicleGeneration,
  VehicleMake,
  VehicleModel,
  VehiclePhoto,
} from "@orasso/shared";

import { request } from "../http";

export const garageApi = {
  vehicles: () => request<VehicleFull[]>("/api/me/vehicles"),
  vehicle: (id: string) => request<VehicleFull>(`/api/me/vehicles/${id}`),
  deleteVehiclePhoto: (vehicleId: string, photoId: string) =>
    request<unknown>(`/api/me/vehicles/${vehicleId}/photos/${photoId}`, { method: "DELETE" }),
  createVehicle: (body: VehicleCreate) => request<VehicleFull>("/api/me/vehicles", { method: "POST", body }),
  uploadVehiclePhoto: (vehicleId: string, form: FormData) =>
    request<VehiclePhoto>(`/api/me/vehicles/${vehicleId}/photos`, { method: "POST", form, timeout: 60_000 }),
  makes: () => request<VehicleMake[]>("/api/vehicle-reference/makes"),
  models: (makeId: string) => request<VehicleModel[]>(`/api/vehicle-reference/makes/${makeId}/models`),
  generations: (modelId: string) =>
    request<VehicleGeneration[]>(`/api/vehicle-reference/models/${modelId}/generations`),
  categories: () => request<Category[]>("/api/vehicle-reference/categories"),
};
