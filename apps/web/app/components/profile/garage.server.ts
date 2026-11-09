import type {
  AccountQrSecret,
  MyCrew,
  PlateTransferView,
  VehicleDetail,
  VehicleFull,
  VehiclePros,
} from "@orasso/shared";
import { data } from "react-router";

import { api } from "../../lib/api.server";
import type { PanelFailure } from "./panel";
import { mainOrFailure } from "./panel.server";

// Lot R7b1 : lecture et actions de l'onglet « Garage » du Profil (avant : la page `/app/garage`, lot 51 ; lots R4c, M5).

export type GarageData = {
  vehicles: VehicleFull[];
  certs: Record<string, { cert: VehicleDetail["certification"]; photos: number }>;
  pros: VehiclePros | null;
  archived: VehicleFull[];
  incoming: PlateTransferView[];
  crews: MyCrew[];
  qrSecret: AccountQrSecret | null;
  photoRefused: boolean;
};

/** Ce que l'onglet « Garage » lit (chargé seulement quand l'onglet est ouvert). */
export async function loadGarage(request: Request): Promise<GarageData | PanelFailure> {
  const [vehiclesRes, transfers, crews, qrSecret] = await Promise.all([
    api<VehicleFull[]>(request, "/me/vehicles"),
    api<{ incoming: PlateTransferView[]; outgoing: unknown[] }>(request, "/me/plate-transfers"),
    // En-tête : mes crews (lot 19, docs/02 « Garage »).
    api<MyCrew[]>(request, "/me/crews"),
    // QR de compte (lot 30) : le secret sert au calcul du code dans le navigateur ; la page n'est jamais mise en cache.
    api<AccountQrSecret>(request, "/me/account-qr-secret"),
  ]);
  // Tour 2 : sans la liste des véhicules, le panneau tombe seul (message + « Réessayer »), jamais tout Mon compte.
  const main = mainOrFailure(request, vehiclesRes);
  if ("failed" in main) return main;
  const vehicles = main.data;
  const photoRefused = new URL(request.url).searchParams.get("photo") === "refusee";
  const active = vehicles.filter((v) => v.status === "active");
  // Lot M5 (parité de la maquette 7.1) : la ligne de certification de chaque véhicule actif et « Pour ta … » du premier
  // (pros partenaires, sponsorisé lié au véhicule : compté par l'API quand elle le renvoie, la page l'affiche toujours).
  const [details, pros] = await Promise.all([
    Promise.all(active.map((v) => api<VehicleDetail>(request, `/me/vehicles/${v.id}`))),
    active[0] ? api<VehiclePros>(request, `/me/vehicles/${active[0].id}/pros`) : Promise.resolve(null),
  ]);
  const certs: Record<string, { cert: VehicleDetail["certification"]; photos: number }> = {};
  for (const d of details) if (d.ok) certs[d.data.id] = { cert: d.data.certification, photos: d.data.photos.length };
  return {
    vehicles: active,
    certs,
    pros: pros?.ok ? pros.data : null,
    archived: vehicles.filter((v) => v.status !== "active"),
    incoming: transfers.ok ? transfers.data.incoming : [],
    crews: crews.ok ? crews.data : [],
    qrSecret: qrSecret.ok ? qrSecret.data : null,
    photoRefused,
  };
}

export const GARAGE_INTENTS = ["feature", "transfer-accept", "transfer-decline"] as const;
export type GarageActionData = { error: string | null; featured?: string | null };

/** Les actions de l'onglet : « Mettre en avant » un véhicule, accepter ou refuser un transfert de plaque. */
export async function garageAction(request: Request, form: FormData, intent: string) {
  // Lot R4c (maquette R4.5) : « Mettre en avant » un véhicule (le véhicule principal).
  if (intent === "feature") {
    const vehicleId = String(form.get("vehicleId") ?? "");
    const res = await api(request, "/me/main-vehicle", { method: "PUT", json: { vehicleId } });
    if (!res.ok) return data({ scope: "garage", error: res.error.message, featured: null }, { status: res.status });
    return data({ scope: "garage", error: null, featured: String(form.get("label") ?? "") });
  }
  if (intent === "transfer-accept" || intent === "transfer-decline") {
    const id = String(form.get("transferId") ?? "");
    const res = await api(request, `/plate-transfers/${encodeURIComponent(id)}/${intent.slice(9)}`, {
      method: "POST",
    });
    if (!res.ok) return data({ scope: "garage", error: res.error.message }, { status: res.status });
    return data({ scope: "garage", error: null });
  }
  return data({ scope: "garage", error: "Action inconnue." }, { status: 400 });
}
