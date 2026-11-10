// Affiche à partager en écran de flux (lot C2b ; lot M6, maquette 2.1) : barre « Affiche à partager · Ta GR Supra,
// signée Orasso » et ✕ (mode B, plein écran, sans barre d'onglets), puis le contenu commun (`PosterBody`). Depuis le lot R7f4, elle
// s'ouvre par « Vers l'extérieur » de la feuille « Partager » d'une voiture (`/vehicule/<id>/partager`).
import { shareSheetLabels as L } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";

import { PosterBody } from "@/features/share/PosterSheet";
import { shareSheetKey } from "@/features/vehicle/shareSheetKey";
import { api } from "@/lib/api";
import { usePersona } from "@/lib/persona";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { FlowScreen } from "@/ui/Screens";

export default function AfficheVehicule() {
  const router = useRouter();
  const { openProfile } = usePersona();
  const { id } = useLocalSearchParams<{ id: string }>();
  const vehicle = useApi(() => api.vehicle(id), [id]);
  const close = () => (router.canGoBack() ? router.back() : openProfile("garage"));
  const model = vehicle.data?.modelName;
  return (
    <FlowScreen title={L.title} facts={model ? L.subtitleOf(model) : L.subtitle} onClose={close}>
      {vehicle.data ? (
        <PosterBody
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
