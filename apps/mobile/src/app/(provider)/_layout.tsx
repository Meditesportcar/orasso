// Casquette Prestataire (DA v2, lot 40, prototype `s-missions`) : Missions · Le Fil · Accueil (le O, au centre) ·
// Candidatures · Page (lot R9n, maquette R9.1). La barre vient de `tabSets.provider` ; la Vitrine et l'ancien Profil sont
// des pages masquées, rangées sous « Page » (leurs adresses ne changent pas).
import { Tabs } from "expo-router";

import { PersonaTabSet } from "@/ui/PersonaTabs";

const extra = { vitrine: "page", profil: "page" };

export default function ProviderLayout() {
  return (
    <PersonaTabSet kind="provider" extra={extra}>
      <Tabs.Screen name="vitrine" options={{ href: null }} />
      <Tabs.Screen name="profil" options={{ href: null }} />
    </PersonaTabSet>
  );
}
