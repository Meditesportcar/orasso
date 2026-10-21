// Casquette Organisateur (DA v2, lot 40, prototype `s-plan`) : Événements · Tri · Direct (le O, au centre) · Équipe ·
// Structure. La barre vient de `tabSets.organizer` ; la Boîte de la structure est en haut à droite (`/boite/orga`).
// La page d'un événement (`evenement/[id]`, lot 22), les bannissements, les modèles et les notes
// internes (lot 35a) sont des pages masquées qui gardent la barre, rangées sous l'onglet qui les ouvre.
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
  "evenement/[id]": "events",
  "evenement/[id]/inviter": "events",
  "evenement/[id]/bilan": "events",
  "evenement/[id]/billetterie": "events",
  bannis: "team",
  modeles: "team",
  notes: "team",
};

export default function OrgaLayout() {
  const { persona } = usePersona();
  const requests = useTeamRequestsCount(persona.kind === "organizer" ? persona.structureId : null);
  // Un point sur l'onglet Équipe tant qu'une demande pour devenir staff attend (le nombre est dans l'écran).
  const decorate = useCallback((tab: TabItem) => (tab.id === "team" ? { ...tab, dot: requests > 0 } : tab), [requests]);
  return (
    <View style={{ flex: 1 }}>
      {/* Lot 35d : bandeau du mode assistance (un super admin survole l'espace de la structure). */}
      <AssistanceBanner />
      <PersonaTabSet kind="organizer" extra={extra} decorate={decorate}>
        <Tabs.Screen name="evenement/[id]" options={{ href: null }} />
        {/* Inviter (lot 25), depuis la page d'un événement. */}
        <Tabs.Screen name="evenement/[id]/inviter" options={{ href: null }} />
        {/* Bilan et remerciement (lot 27), depuis la page d'un événement. */}
        <Tabs.Screen name="evenement/[id]/bilan" options={{ href: null }} />
        {/* Lot C4a : l'assistant (créer, modifier) est un flux sans barre, hors du groupe (app/nouvel-evenement.tsx,
            app/evenement/[id]/modifier.tsx), comme l'artefact (`.app.is-flow`). Mêmes adresses. */}
        {/* Lot 35a : bannissements, modèles de message, notes internes, depuis l'Équipe. */}
        <Tabs.Screen name="bannis" options={{ href: null }} />
        <Tabs.Screen name="modeles" options={{ href: null }} />
        <Tabs.Screen name="notes" options={{ href: null }} />
        {/* Billetterie des visiteurs (lot 35c), depuis la page d'un événement. */}
        <Tabs.Screen name="evenement/[id]/billetterie" options={{ href: null }} />
      </PersonaTabSet>
    </View>
  );
}
