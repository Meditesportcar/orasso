// Casquette Organisateur (docs/02, ARCHITECTURE-SUITE § 7.1 et § 7.2) : Direct · Événements · Tri (au centre) · Boîte · Staff.
// La barre vient de `tabSets.organizer` (lot 16). La page d'un événement (`evenement/[id]`, lot 22) est une route de ce
// groupe masquée dans la barre.
import { tabSets } from "@orasso/design-system/native";
import { Tabs } from "expo-router";

import { PersonaTabs } from "@/ui/PersonaTabs";

/** Nom de la route → identifiant d'onglet (`tabSets.organizer`). */
const routes = { direct: "live", evenements: "events", tri: "sort", boite: "inbox", staff: "staff" };

export default function OrgaLayout() {
  return (
    <PersonaTabs tabs={tabSets.organizer} routes={routes} initialRouteName="direct">
      <Tabs.Screen name="direct" />
      <Tabs.Screen name="evenements" />
      <Tabs.Screen name="tri" />
      <Tabs.Screen name="boite" />
      <Tabs.Screen name="staff" />
      <Tabs.Screen name="evenement/[id]" options={{ href: null }} />
    </PersonaTabs>
  );
}
