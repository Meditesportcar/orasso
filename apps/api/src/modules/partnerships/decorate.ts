// Ajouts de R7m1 aux réponses d'un autre module, sans que ce module importe les partenariats (pas de cycle) : le profil
// d'un passionné (« Partenaires », « Proposer »), la fiche d'un véhicule (« Partenaire : … »).
import type {
  OtherVehicle,
  PartnerLogo,
  PartnershipOffer,
  ProfileVehicle,
  UserProfileView,
  VehicleDetail,
  VehiclePartner,
} from "@orasso/shared";

import type { Viewer } from "../../lib/session";
import { partnershipsService } from "./service";

export type ProfileWithPartners = Omit<UserProfileView, "vehicles"> & {
  vehicles: ProfileVehicle[];
  partners: PartnerLogo[];
  partnershipOffer: PartnershipOffer | null;
};

/**
 * `GET /users/:pseudo` : « Partenaires » (pros actifs ; vide pour un compte privé que je ne suis pas), et le bouton
 * « Proposer » pour un pro vérifié qui regarde (jamais sur son propre profil).
 */
export async function decorateProfile(v: Viewer, view: UserProfileView): Promise<ProfileWithPartners> {
  const limited = view.audience === "public_limited";
  const [partners, partnershipOffer, onCars] = await Promise.all([
    limited ? Promise.resolve([]) : partnershipsService.partnersOfUser(view.userId),
    view.audience === "self" ? Promise.resolve(null) : partnershipsService.offerFor(v, view.userId),
    limited
      ? Promise.resolve(new Map<string, VehiclePartner>())
      : partnershipsService.partnersOfVehicles(view.vehicles.map((x) => x.id)),
  ]);
  // Le partenaire d'une voiture ne sort que pour les regards qui voient le détail de la voiture (liste blanche : sans ce
  // détail, la voiture ne gagne aucun champ).
  const vehicles = view.vehicles.map((x) => {
    const partner = x.detailed ? onCars.get(x.id) : undefined;
    return partner ? { ...x, partner } : x;
  });
  return { ...view, vehicles, partners, partnershipOffer };
}

/** `GET /vehicles/:id` : le partenaire actif de la voiture, seulement quand la fiche complète est visible. */
export async function decorateOtherVehicle(vehicle: OtherVehicle): Promise<OtherVehicle> {
  // Liste blanche : la fiche réduite d'un compte privé ne gagne aucun champ (`privateVehicleFields`).
  if (!vehicle.detailed) return vehicle;
  return { ...vehicle, partner: await partnershipsService.partnerOfVehicle(vehicle.id) };
}

/** `GET /me/vehicles/:id` : le partenaire de ma voiture. */
export async function decorateMyVehicle(
  vehicle: VehicleDetail,
): Promise<VehicleDetail & { partner: VehiclePartner | null }> {
  return { ...vehicle, partner: await partnershipsService.partnerOfVehicle(vehicle.id) };
}

/** `GET /me/vehicles` : le partenaire de chacune de mes voitures. */
export async function decorateMyVehicles<T extends { id: string }>(
  items: T[],
): Promise<(T & { partner: VehiclePartner | null })[]> {
  const onCars = await partnershipsService.partnersOfVehicles(items.map((x) => x.id));
  return items.map((x) => ({ ...x, partner: onCars.get(x.id) ?? null }));
}
