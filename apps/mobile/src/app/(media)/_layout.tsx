// Casquette Média (DA v2, lot 40, prototype `s-agenda`) : Explorer · Le Fil · Accueil (le O, au centre) · Presse · Page
// (lot R9n, maquette R9.1). La casquette vient de l'API (lot 45) ; les écrans sont ceux du lot 55 (`features/media/`).
// Les Contenus et l'ancien Profil sont des pages masquées, rangées sous « Page » (leurs adresses ne changent pas).
import { Tabs } from "expo-router";

import { PersonaTabSet } from "@/ui/PersonaTabs";

const extra = { contenus: "page", profil: "page" };

export default function MediaLayout() {
  return (
    <PersonaTabSet kind="media" extra={extra}>
      <Tabs.Screen name="contenus" options={{ href: null }} />
      <Tabs.Screen name="profil" options={{ href: null }} />
    </PersonaTabSet>
  );
}
