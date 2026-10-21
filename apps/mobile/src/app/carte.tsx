// Carte d'Explorer en écran plein (lot C2a, artefact DA v2 `s-map`) : un écran de flux, sans barre d'onglets ni accès
// flottant, ouvert par la puce « Carte » d'Explorer. Il reprend la recherche et le segment (Événements ou Pros) d'où il
// vient ; l'étiquette touchée montre l'aperçu de l'événement (ou du pro) sous la carte ; ✕ ramène à la liste.
import { explorerV2Labels as L } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";

import { EventsSegment } from "@/features/explorer/EventsSegment";
import { ProsSegment } from "@/features/explorer/ProsSegment";
import { emptyEventFilters } from "@/features/explorer/queries";
import { useExplorerPosition } from "@/features/explorer/useExplorerPosition";
import { useSession } from "@/lib/session";
import { FlowScreen } from "@/ui/Screens";

export default function Carte() {
  const router = useRouter();
  const params = useLocalSearchParams<{ segment?: string; q?: string }>();
  const q = typeof params.q === "string" ? params.q : "";
  const pros = params.segment === "pros";
  const dept = useSession().me?.profile.departments[0] ?? null;
  const position = useExplorerPosition();
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));
  return (
    <FlowScreen title={L.map} facts={q || undefined} onClose={close}>
      {pros ? (
        <ProsSegment q={q} position={position} dept={dept} view="map" />
      ) : (
        <EventsSegment q={q} filters={emptyEventFilters} position={position} dept={dept} view="map" />
      )}
    </FlowScreen>
  );
}
