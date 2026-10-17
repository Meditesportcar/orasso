// Casquette Administration (lot 35d, décision D20 : tout se gère depuis l'appli). Visible seulement pour les rôles
// `moderator` et `super_admin` ; la barre a quatre onglets pour le super admin (Accueil, Signalements, Registres, Gestion)
// et deux pour le modérateur (Accueil, Signalements : l'API ne lui ouvre rien d'autre). Les pages (structures à vérifier,
// sanctions, fiche d'un utilisateur, newsletter…) sont des routes de ce groupe masquées dans la barre ; elles
// s'allument sous l'onglet qui les range. Le retour (✕) suit l'historique.
import type { TabItem } from "@orasso/design-system/native";
import { Tabs } from "expo-router";
import { useMemo } from "react";

import { adminRoleOf } from "@/lib/adminModel";
import { useSession } from "@/lib/session";
import { PersonaTabs } from "@/ui/PersonaTabs";

const superTabs: TabItem[] = [
  { id: "home", label: "Accueil", icon: "home" },
  { id: "reports", label: "Signalements", icon: "flag" },
  { id: "registries", label: "Registres", icon: "list" },
  { id: "manage", label: "Gestion", icon: "express" },
];
const moderatorTabs: TabItem[] = superTabs.slice(0, 2);

/** Nom de la route → identifiant d'onglet ; les pages masquées pointent vers l'onglet qui les range (les onglets d'abord). */
const routes: Record<string, string> = {
  accueil: "home",
  signalements: "reports",
  registres: "registries",
  gestion: "manage",
  "signalement/[id]": "reports",
  verification: "home",
  certifications: "home",
  transferts: "home",
  badges: "home",
  "structure/[id]": "home",
  sanctions: "home",
  contestations: "home",
  assistance: "home",
  utilisateurs: "registries",
  "utilisateur/[id]": "registries",
  structures: "registries",
  pros: "registries",
  vehicules: "registries",
  journal: "registries",
  parametres: "manage",
  newsletter: "manage",
  sponsorises: "manage",
  horloge: "manage",
};

const hidden = [
  "signalement/[id]",
  "verification",
  "certifications",
  "transferts",
  "badges",
  "structure/[id]",
  "sanctions",
  "contestations",
  "assistance",
  "utilisateurs",
  "utilisateur/[id]",
  "structures",
  "pros",
  "vehicules",
  "journal",
  "parametres",
  "newsletter",
  "sponsorises",
  "horloge",
] as const;

export default function AdminLayout() {
  const { me } = useSession();
  const role = adminRoleOf(me?.profile.platformRole);
  const tabs = useMemo(() => (role === "moderator" ? moderatorTabs : superTabs), [role]);
  return (
    <PersonaTabs tabs={tabs} routes={routes} initialRouteName="accueil" backBehavior="history">
      <Tabs.Screen name="accueil" />
      <Tabs.Screen name="signalements" />
      <Tabs.Screen name="registres" options={{ href: role === "moderator" ? null : undefined }} />
      <Tabs.Screen name="gestion" options={{ href: role === "moderator" ? null : undefined }} />
      {hidden.map((name) => (
        <Tabs.Screen key={name} name={name} options={{ href: null }} />
      ))}
    </PersonaTabs>
  );
}
