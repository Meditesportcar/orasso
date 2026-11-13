// Casquette Organisateur (DA v2, lot 40, prototype `s-plan`) : Événements · Tri · Direct (le O, au centre) · Le Fil · Page
// (lot R9n, maquette R9.1). La barre vient de `tabSets.organizer` ; la Boîte de la structure est en haut à droite
// (`/messages/orga`). L'Équipe et la Structure n'ont plus d'onglet : pages masquées, rangées sous « Page » avec les
// bannissements, les modèles et les notes internes (lot 35a). Leurs adresses ne changent pas.
import type { TabItem } from "@orasso/design-system/native";
import { Tabs } from "expo-router";
import { useCallback } from "react";
import { View } from "react-native";

import { AssistanceBanner } from "@/features/admin/Assistance";
import { usePersona } from "@/lib/persona";
import { useTeamRequestsCount } from "@/lib/teamBadge";
import { PersonaTabSet } from "@/ui/PersonaTabs";

/** Pages masquées → onglet qui les range. */
const extra = {
  equipe: "page",
  structure: "page",
  bannis: "page",
  modeles: "page",
  notes: "page",
};

export default function OrgaLayout() {
  const { persona } = usePersona();
  const requests = useTeamRequestsCount(persona.kind === "organizer" ? persona.structureId : null);
  // Un point sur l'onglet Page (R9n : l'Équipe y est rangée, R9d décidera de son sort) tant qu'une demande pour devenir staff attend (le nombre est dans l'écran).
  const decorate = useCallback((tab: TabItem) => (tab.id === "page" ? { ...tab, dot: requests > 0 } : tab), [requests]);
  return (
    <View style={{ flex: 1 }}>
      {/* Lot 35d : bandeau du mode assistance (un super admin survole l'espace de la structure). */}
      <AssistanceBanner />
      <PersonaTabSet kind="organizer" extra={extra} decorate={decorate}>
        {/* Lot C4a : la page d'un événement, ses sous-pages et l'assistant (créer, modifier)
            sont des flux sans barre, hors du groupe (app/evenement/, app/nouvel-evenement.tsx), comme l'artefact (`.app.is-flow`). Mêmes adresses. */}
        {/* Lot R9n : l'Équipe et la Structure ont quitté la barre ; lot 35a : bannissements, modèles de message, notes
            internes, depuis l'Équipe. */}
        <Tabs.Screen name="equipe" options={{ href: null }} />
        <Tabs.Screen name="structure" options={{ href: null }} />
        <Tabs.Screen name="bannis" options={{ href: null }} />
        <Tabs.Screen name="modeles" options={{ href: null }} />
        <Tabs.Screen name="notes" options={{ href: null }} />
      </PersonaTabSet>
    </View>
  );
}
