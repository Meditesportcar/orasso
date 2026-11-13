// Casquette Pro (DA v2, lot 40, prototype `s-pscan`) : Scanner · Le Fil · Accueil (le O, au centre) · Stats · Page (lot R9n,
// maquette R9.1). Ma fiche, Modifier la fiche, Publier et l'ancien Profil sont des pages masquées, rangées sous « Page »
// (leurs adresses ne changent pas). Aucun bouton ni lien de paiement dans l'appli : l'abonnement se gère sur le site.
import { Tabs } from "expo-router";

import { PersonaTabSet } from "@/ui/PersonaTabs";

const extra = { fiche: "page", modifier: "page", publier: "page", profil: "page" };

export default function ProLayout() {
  return (
    <PersonaTabSet kind="pro" extra={extra}>
      {/* Ma fiche (R9n : plus un onglet), modifier la fiche (lot 35c) et publier une actualité, depuis la Page. */}
      <Tabs.Screen name="fiche" options={{ href: null }} />
      <Tabs.Screen name="modifier" options={{ href: null }} />
      <Tabs.Screen name="publier" options={{ href: null }} />
      <Tabs.Screen name="profil" options={{ href: null }} />
    </PersonaTabSet>
  );
}
