// Casquette Prestataire (docs/02, ARCHITECTURE-SUITE § 6.4 et § 7.1) : Candidatures · Profil · Boîte.
// Squelette du lot 16 : la barre vient de `legacyTabSets.provider` et chaque onglet affiche « Bientôt ». Le lot 21 remplace
// les écrans ; ce fichier ne change pas.
import { legacyTabSets } from "@orasso/design-system/native";
import { Tabs } from "expo-router";

import { PersonaTabs } from "@/ui/PersonaTabs";

/** Nom de la route → identifiant d'onglet (`legacyTabSets.provider`). */
const routes = { candidatures: "applications", profil: "profile", boite: "inbox" };

export default function ProviderLayout() {
  return (
    <PersonaTabs tabs={legacyTabSets.provider} routes={routes} initialRouteName="candidatures">
      <Tabs.Screen name="candidatures" />
      <Tabs.Screen name="profil" />
      <Tabs.Screen name="boite" />
    </PersonaTabs>
  );
}
