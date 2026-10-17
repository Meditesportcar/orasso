// Casquette Organisateur (docs/02, ARCHITECTURE-SUITE § 7.1 et § 7.2) : Direct · Événements · Tri (au centre) · Boîte · Staff.
// La barre vient de `tabSets.organizer` (lot 16). La page d'un événement (`evenement/[id]`, lot 22) est une route de ce
// groupe masquée dans la barre. Lot 35a (D20) : l'onglet Staff est l'écran Équipe (demandes, membres, invitations) ; la
// structure, les bannissements, les modèles et les notes internes sont des écrans masqués, ouverts depuis l'Équipe.
// Lot 35b : l'assistant d'événement (`nouvel-evenement`, `evenement/[id]/modifier`), masqué lui aussi.
import { tabSets } from "@orasso/design-system/native";
import { Tabs } from "expo-router";
import { useMemo } from "react";

import { usePersona } from "@/lib/persona";
import { useTeamRequestsCount } from "@/lib/teamBadge";
import { PersonaTabs } from "@/ui/PersonaTabs";

/** Nom de la route → identifiant d'onglet (`tabSets.organizer`). */
const routes = { direct: "live", evenements: "events", tri: "sort", boite: "inbox", staff: "staff" };

export default function OrgaLayout() {
  const { persona } = usePersona();
  const requests = useTeamRequestsCount(persona.kind === "organizer" ? persona.structureId : null);
  // Un point sur l'onglet Staff tant qu'une demande pour devenir staff attend (le nombre est dans l'écran).
  const tabs = useMemo(
    () => tabSets.organizer.map((tab) => (tab.id === "staff" ? { ...tab, dot: requests > 0 } : tab)),
    [requests],
  );
  return (
    <PersonaTabs tabs={tabs} routes={routes} initialRouteName="direct">
      <Tabs.Screen name="direct" />
      <Tabs.Screen name="evenements" />
      <Tabs.Screen name="tri" />
      <Tabs.Screen name="boite" />
      <Tabs.Screen name="staff" />
      <Tabs.Screen name="evenement/[id]" options={{ href: null }} />
      {/* Inviter (lot 25), depuis la page d'un événement. */}
      <Tabs.Screen name="evenement/[id]/inviter" options={{ href: null }} />
      {/* Bilan et remerciement (lot 27), depuis la page d'un événement. */}
      <Tabs.Screen name="evenement/[id]/bilan" options={{ href: null }} />
      {/* Lot 35b : créer un événement (onglet Événements) et le modifier (page de l'événement). */}
      <Tabs.Screen name="nouvel-evenement" options={{ href: null }} />
      <Tabs.Screen name="evenement/[id]/modifier" options={{ href: null }} />
      {/* Lot 35a : structure, bannissements, modèles de message, notes internes, depuis l'Équipe. */}
      <Tabs.Screen name="ma-structure" options={{ href: null }} />
      <Tabs.Screen name="bannis" options={{ href: null }} />
      <Tabs.Screen name="modeles" options={{ href: null }} />
      <Tabs.Screen name="notes" options={{ href: null }} />
      {/* Billetterie des visiteurs (lot 35c), depuis la page d'un événement. */}
      <Tabs.Screen name="evenement/[id]/billetterie" options={{ href: null }} />
    </PersonaTabs>
  );
}
