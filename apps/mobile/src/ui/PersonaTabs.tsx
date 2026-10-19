// Barre d'onglets d'une casquette (lot 16 ; toutes les casquettes depuis le lot 40, plus de barre maison) : les onglets
// viennent de `tabSets` du système de design (`PersonaTabSet` pour les six profils), chaque route du groupe Expo Router
// a l'identifiant d'un onglet ; les pages masquées (`href: null`) pointent vers l'onglet qui les range et gardent la
// barre. Le conteneur porte le glissement entre onglets (`useTabSwipe`, lot 40).
import { TabBar, type TabItem, tabSets } from "@orasso/design-system/native";
import { Tabs } from "expo-router";
import { type ComponentProps, type ReactNode, useCallback, useMemo, useRef } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { neighbourRoute } from "@/features/nav/swipe";
import { TabSwipeContext, useTabSwipe } from "@/features/nav/useTabSwipe";
import { personaTabSets, personaTabs } from "@/lib/personaModel";

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];
type Navigator = { current: string | undefined; navigate: (route: string) => void };
const NO_EXTRA: Record<string, string> = {};

function PersonaTabBar({
  state,
  navigation,
  tabs,
  routes,
  navigator,
}: TabBarProps & {
  tabs: readonly TabItem[];
  routes: Record<string, string>;
  navigator: { current: Navigator | null };
}) {
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;
  // Le glissement a besoin de l'onglet courant et de la navigation du groupe : la barre les lui prête.
  navigator.current = { current, navigate: (route) => navigation.navigate(route) };
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
  backBehavior,
  children,
}: {
  tabs: readonly TabItem[];
  /** Nom de la route → identifiant d'onglet (les onglets d'abord, puis les pages masquées). */
  routes: Record<string, string>;
  initialRouteName: string;
  /** Retour arrière (lot 35d : « history » pour que ✕ ramène à l'écran d'où l'on vient). Par défaut, celui d'Expo Router. */
  backBehavior?: ComponentProps<typeof Tabs>["backBehavior"];
  /** Les `<Tabs.Screen name="…" />`, dans l'ordre de la barre. */
  children: ReactNode;
}) {
  const navigator = useRef<Navigator | null>(null);
  const tabIds = useMemo(() => tabs.map((tab) => tab.id), [tabs]);
  const onSwipe = useCallback(
    (direction: 1 | -1) => {
      const nav = navigator.current;
      const next = nav ? neighbourRoute(tabIds, routes, nav.current, direction) : null;
      if (nav && next) nav.navigate(next);
    },
    [tabIds, routes],
  );
  const { panHandlers, control } = useTabSwipe(onSwipe);
  return (
    <TabSwipeContext.Provider value={control}>
      <View
        style={[styles.fill, Platform.OS === "web" ? styles.noSelect : null]}
        {...panHandlers}
        testID="persona-tabs"
      >
        <Tabs
          initialRouteName={initialRouteName}
          backBehavior={backBehavior}
          screenOptions={{ headerShown: false, animation: "none" }}
          tabBar={(props) => <PersonaTabBar {...props} tabs={tabs} routes={routes} navigator={navigator} />}
        >
          {children}
        </Tabs>
      </View>
    </TabSwipeContext.Provider>
  );
}

/**
 * La barre v2 d'une des six casquettes : ses cinq onglets (`tabSets`) dans l'ordre de `personaTabs`, `extra` = pages
 * masquées du groupe (nom de route → onglet qui les range), `decorate` = pastilles posées sur un onglet.
 */
export function PersonaTabSet({
  kind,
  extra = NO_EXTRA,
  decorate,
  children,
}: {
  kind: keyof typeof personaTabs;
  extra?: Record<string, string>;
  decorate?: (tab: TabItem) => TabItem;
  children?: ReactNode;
}) {
  const own = personaTabs[kind] as Record<string, string>;
  const routes = useMemo(() => ({ ...own, ...extra }), [own, extra]);
  const tabs = useMemo(
    () => (tabSets[personaTabSets[kind]] as readonly TabItem[]).map((tab) => (decorate ? decorate(tab) : tab)),
    [kind, decorate],
  );
  const names = Object.keys(own);
  return (
    <PersonaTabs tabs={tabs} routes={routes} initialRouteName={names[2] ?? names[0] ?? ""}>
      {names.map((name) => (
        <Tabs.Screen key={name} name={name} />
      ))}
      {children}
    </PersonaTabs>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Version web (recette) : glisser à la souris sélectionnerait le texte, et une sélection interrompt le geste.
  noSelect: { userSelect: "none" },
});
