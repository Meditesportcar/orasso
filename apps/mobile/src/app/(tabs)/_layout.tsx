// Les cinq onglets du passionné : Accueil · Explorer · Accès (au centre, en couleur) · Garage · Boîte.
import { legacyTabSets, TabBar } from "@orasso/design-system/native";
import { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSession } from "@/lib/session";

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

/** Nom de la route → identifiant d'onglet du système de design (`legacyTabSets.fan`). */
const tabIds = { accueil: "home", explorer: "explore", acces: "access", garage: "garage", boite: "inbox" } as const;
const routeOf = Object.fromEntries(Object.entries(tabIds).map(([route, id]) => [id, route])) as Record<string, string>;

function AppTabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { me } = useSession();
  const current = state.routes[state.index]?.name as keyof typeof tabIds | undefined;
  // Pastille de la Boîte (lot 18) : conversations avec du non lu + demandes en attente (`GET /me` → `unreadInbox`).
  const tabs = legacyTabSets.fan.map((tab) => (tab.id === "inbox" ? { ...tab, dot: (me?.unreadInbox ?? 0) > 0 } : tab));
  return (
    <TabBar
      tabs={tabs}
      active={current ? tabIds[current] : "home"}
      safeBottom={insets.bottom}
      onSelect={(id) => {
        const route = routeOf[id];
        if (route) navigation.navigate(route);
      }}
    />
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      initialRouteName="accueil"
      screenOptions={{ headerShown: false, animation: "none" }}
      tabBar={(props) => <AppTabBar {...props} />}
    >
      <Tabs.Screen name="accueil" />
      <Tabs.Screen name="explorer" />
      <Tabs.Screen name="acces" />
      <Tabs.Screen name="garage" />
      <Tabs.Screen name="boite" />
    </Tabs>
  );
}
