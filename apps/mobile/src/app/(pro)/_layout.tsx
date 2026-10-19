// Casquette Pro (DA v2, lot 40, prototype `s-pscan`) : Scanner · Ma fiche · Accueil (le O, au centre) · Stats · Profil.
// Modifier la fiche et Publier sont des pages masquées, rangées sous Ma fiche. Aucun bouton ni lien de paiement dans
// l'appli : l'abonnement se gère sur le site.
import { Tabs } from "expo-router";

import { PersonaTabSet } from "@/ui/PersonaTabs";

const extra = { modifier: "card", publier: "card" };

export default function ProLayout() {
  return (
    <PersonaTabSet kind="pro" extra={extra}>
      {/* Modifier la fiche (lot 35c) et publier une actualité, depuis Ma fiche. */}
      <Tabs.Screen name="modifier" options={{ href: null }} />
      <Tabs.Screen name="publier" options={{ href: null }} />
    </PersonaTabSet>
  );
}
