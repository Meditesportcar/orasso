// Carte à partager en écran de flux (lot C2b, prototype `s-share`) : barre « Carte à partager · Format story, signée
// Orasso » et ✕, puis le contenu commun (`ShareBody`). Ouvert depuis « Partager sa carte » du Garage. Sans barre
// d'onglets ni accès flottant : « En story » n'est plus caché (audit § 1, feuilles sous la barre).
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
  return (
    <FlowScreen title={L.title} facts={L.subtitle} onClose={close}>
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
