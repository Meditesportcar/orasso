// Barre d'onglets d'une casquette (Organisateur, Prestataire) : les onglets viennent de `tabSets` du système de design,
// chaque route de l'écran Expo Router a l'identifiant d'un onglet. Le passionné (`(tabs)`) et le pro (`(pro)`) ont
// leur propre mise en page ; les lots 21 et 22 remplissent les écrans, pas ce gabarit.
import { TabBar, type TabItem } from "@orasso/design-system/native";
import { Tabs } from "expo-router";
import type { ComponentProps, ReactNode } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

function PersonaTabBar({
  state,
  navigation,
  tabs,
  routes,
}: TabBarProps & { tabs: readonly TabItem[]; routes: Record<string, string> }) {
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;
  return (
    <TabBar
      tabs={tabs}
      active={(current ? routes[current] : undefined) ?? tabs[0]?.id ?? ""}
      safeBottom={insets.bottom}
      onSelect={(id) => {
        const route = Object.keys(routes).find((name) => routes[name] === id);
        if (route) navigation.navigate(route);
      }}
    />
  );
}

export function PersonaTabs({
  tabs,
  routes,
  initialRouteName,
  children,
}: {
  tabs: readonly TabItem[];
  /** Nom de la route → identifiant d'onglet. */
  routes: Record<string, string>;
  initialRouteName: string;
  /** Les `<Tabs.Screen name="…" />`, dans l'ordre de la barre. */
  children: ReactNode;
}) {
  return (
    <Tabs
      initialRouteName={initialRouteName}
      screenOptions={{ headerShown: false, animation: "none" }}
      tabBar={(props) => <PersonaTabBar {...props} tabs={tabs} routes={routes} />}
    >
      {children}
    </Tabs>
  );
}
