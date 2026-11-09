// « Partager » une voiture du garage (lot R7f4, maquette R7.23) : la feuille à quatre destinations (En story, Dans le Fil, En
// message, Vers l'extérieur) en écran de flux (mode B, plein écran). « Vers l'extérieur » mène à l'affiche à trois styles du
// lot 50 (`/vehicule/<id>/affiche`). Ouvert depuis « Partager » du Garage et de la page du véhicule.
import { shareLabels as L } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ShareBody } from "@/features/share/ShareSheet";
import { usePersona } from "@/lib/persona";
import { FlowScreen } from "@/ui/Screens";

export default function PartagerVehicule() {
  const router = useRouter();
  const { openProfile } = usePersona();
  const { id } = useLocalSearchParams<{ id: string }>();
  const close = () => (router.canGoBack() ? router.back() : openProfile("garage"));
  return (
    <FlowScreen title={L.title} onClose={close}>
      <ShareBody
        target={{ type: "vehicle", id }}
        onClose={close}
        onPoster={() => router.push(`/vehicule/${id}/affiche`)}
      />
    </FlowScreen>
  );
}
