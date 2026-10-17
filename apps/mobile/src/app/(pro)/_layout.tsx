// Casquette Pro (docs/02 « Appli — casquettes ») : Scanner (onglet par défaut, au centre) · Fiche · Publier · Stats.
// Les onglets viennent du jeu `pro` du système de design, sans la Boîte (messages, pas encore construits). Aucun
// bouton ni lien de paiement dans l'appli : l'abonnement se gère sur le site.
import { TabBar, type TabItem, tabSets } from "@orasso/design-system/native";
import { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

const tabs: readonly TabItem[] = tabSets.pro.filter((tab) => tab.id !== "inbox");
/** Nom de la route → identifiant d'onglet (`tabSets.pro`). */
const tabIds = { fiche: "card", publier: "publish", scanner: "scanner", stats: "stats" } as const;
const routeOf = Object.fromEntries(Object.entries(tabIds).map(([route, id]) => [id, route])) as Record<string, string>;

function ProTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name as keyof typeof tabIds | "modifier" | undefined;
  return (
    <TabBar
      tabs={tabs}
      active={current === "modifier" ? "card" : current ? tabIds[current] : "scanner"}
      safeBottom={insets.bottom}
      onSelect={(id) => {
        const route = routeOf[id];
        if (route) navigation.navigate(route);
      }}
    />
  );
}

export default function ProLayout() {
  return (
    <Tabs
      initialRouteName="scanner"
      screenOptions={{ headerShown: false, animation: "none" }}
      tabBar={(props) => <ProTabBar {...props} />}
    >
      <Tabs.Screen name="fiche" />
      <Tabs.Screen name="publier" />
      <Tabs.Screen name="scanner" />
      <Tabs.Screen name="stats" />
      {/* Modifier la fiche (lot 35c), depuis l'onglet Fiche. */}
      <Tabs.Screen name="modifier" options={{ href: null }} />
    </Tabs>
  );
}
