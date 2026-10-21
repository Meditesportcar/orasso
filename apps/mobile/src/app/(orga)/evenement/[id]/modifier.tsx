// Casquette Organisateur, « Modifier » un événement (lot 35b, D20) : l'assistant prérempli, depuis la page de
// l'événement (ou juste après « Dupliquer », `?copie=1`). Hors de la barre d'onglets (`href: null`).
import { eventWizardStepOf, eventEditorLabels as L, orgaLabels } from "@orasso/shared";
import { useIsFocused, useLocalSearchParams, useRouter } from "expo-router";

import { OrgaFailure, OrgaGate, useOrga } from "@/features/orga/OrgaGate";
import { EventWizard } from "@/features/orga/wizard/EventWizard";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";

function Editor({ eventId, copy, temps, avert }: { eventId: string; copy: boolean; temps?: string; avert?: string }) {
  const router = useRouter();
  const { structureId } = useOrga();
  const event = useApi(() => api.orgEvent(eventId), [eventId]);
  const e = event.data;
  if (e && e.structure.id === structureId && e.status !== "cancelled") {
    return (
      <EventWizard
        key={e.id}
        event={e}
        notice={avert ?? (copy ? L.duplicated : null)}
        initialStep={eventWizardStepOf(temps)}
      />
    );
  }
  return (
    <FlowScreen
      title={L.editTitle}
      onClose={() => (router.canGoBack() ? router.back() : router.replace(`/evenement/${eventId}`))}
    >
      <OrgaFailure error={event.error} />
      {e && e.structure.id !== structureId ? <Notice tone="error">{orgaLabels.foreignEvent}</Notice> : null}
      {e?.status === "cancelled" ? <Notice tone="error">{orgaLabels.cancelDone}</Notice> : null}
      {!e && !event.error ? <Muted variant="body">Chargement…</Muted> : null}
    </FlowScreen>
  );
}

export default function ModifierEvenement() {
  // Lot 53 : `?temps=lieu` rouvre sur un temps ; sans lui, un brouillon rouvre au premier temps incomplet.
  // `avert` : ce que l'enregistrement qui vient de créer le brouillon a vu refuser (relecture du lot 53).
  const { id, copie, temps, avert } = useLocalSearchParams<{
    id: string;
    copie?: string;
    temps?: string;
    avert?: string;
  }>();
  // Rendu seulement à l'écran : chaque ouverture relit l'événement (jamais un formulaire périmé).
  const focused = useIsFocused();
  return (
    <OrgaGate title={L.editTitle}>
      {focused ? <Editor key={id} eventId={id} copy={copie === "1"} temps={temps} avert={avert} /> : null}
    </OrgaGate>
  );
}
