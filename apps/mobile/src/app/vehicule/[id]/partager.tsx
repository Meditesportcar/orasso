// Affiche à partager en écran de flux (lot C2b ; lot M6, maquette 2.1) : barre « Affiche à partager · Ta GR Supra,
// signée Orasso » et ✕ (mode B, plein écran, sans barre d'onglets), puis le contenu commun (`ShareBody`). Ouvert
// depuis « Partager son affiche » du Garage et de la page du véhicule.
import { shareSheetLabels as L } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ShareBody } from "@/features/vehicle/ShareSheet";
import { shareSheetKey } from "@/features/vehicle/shareSheetKey";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { FlowScreen } from "@/ui/Screens";

export default function PartagerVehicule() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const vehicle = useApi(() => api.vehicle(id), [id]);
  const close = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)/garage"));
  const model = vehicle.data?.modelName;
  return (
    <FlowScreen title={L.title} facts={model ? L.subtitleOf(model) : L.subtitle} onClose={close}>
      {vehicle.data ? (
        <ShareBody
          key={shareSheetKey(vehicle.data.id, vehicle.data.shareVersion)}
          vehicleId={vehicle.data.id}
          version={vehicle.data.shareVersion}
          visible
          onClose={close}
        />
      ) : (
        <Muted variant="body">{vehicle.error ? vehicle.error.message : "Chargement…"}</Muted>
      )}
    </FlowScreen>
  );
}
