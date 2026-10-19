// Modifier un véhicule : les mêmes cinq étapes que l'ajout, préremplies (lot 51). La préparation et la description
// restent dans « Modifier la fiche » de la page du véhicule.
import { useLocalSearchParams, useRouter } from "expo-router";

import { VehicleWizard } from "@/features/vehicle/add/VehicleWizard";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { FlowScreen } from "@/ui/Screens";

export default function ModifierVehicule() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const vehicle = useApi(() => api.vehicle(id), [id]);
  if (!vehicle.data) {
    return (
      <FlowScreen
        title="Modifier le véhicule"
        onClose={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/garage"))}
      >
        <Muted variant="body">{vehicle.error ? vehicle.error.message : "Chargement…"}</Muted>
      </FlowScreen>
    );
  }
  return <VehicleWizard vehicle={vehicle.data} />;
}
