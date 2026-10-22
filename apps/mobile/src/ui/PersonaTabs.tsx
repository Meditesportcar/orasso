// Barre d'onglets d'une casquette (lot 16 ; toutes les casquettes depuis le lot 40, plus de barre maison) : les onglets
// viennent de `tabSets` du système de design (`PersonaTabSet` pour les six profils), chaque route du groupe Expo Router
// a l'identifiant d'un onglet ; les pages masquées (`href: null`) pointent vers l'onglet qui les range et gardent la
// barre. Le conteneur porte le glissement entre onglets (`useTabSwipe`, lot 40).
// Lot C1 (artefact DA v2) : la barre flotte au-dessus du contenu (`.tabbar` absolue, 10 px des bords) ; elle se retire,
// avec l'accès flottant, sur un écran de flux et sous une feuille ouverte (`useTabBarHidden`).
// Lot M3 (fluidité) : sur le téléphone, les onglets sont des pages natives (`PagerTabs`) : la page suit le doigt et
// la voisine est déjà montée. Avec « Réduire les animations », le geste natif est coupé et le glissement d'avant
// (`PanResponder`, onglet qui apparaît en fondu de 120 ms) reprend. Le site de recette garde les onglets d'avant.
import { TabBar, type TabItem, tabSets, useTabBarHidden, useTheme } from "@orasso/design-system/native";
import { Tabs } from "expo-router";
import { type ComponentProps, type ReactNode, useCallback, useMemo, useRef } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { neighbourRoute } from "@/features/nav/swipe";
import { TabSwipeContext, useTabSwipe } from "@/features/nav/useTabSwipe";
import { NextAccessBar } from "@/features/sorties/NextAccessBar";
import { personaTabSets, personaTabs } from "@/lib/personaModel";
import { PagerTabs } from "./pagerTabs";
import type { PagerTabBarProps } from "./pagerTabsTypes";

type Navigator = { current: string | undefined; navigate: (route: string) => void };
const NO_EXTRA: Record<string, string> = {};

function PersonaTabBar({
  state,
  navigation,
  tabs,
  routes,
  navigator,
}: PagerTabBarProps & {
  tabs: readonly TabItem[];
  routes: Record<string, string>;
  navigator: { current: Navigator | null };
}) {
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;
  // Le glissement a besoin de l'onglet courant et de la navigation du groupe : la barre les lui prête.
  navigator.current = { current, navigate: (route) => navigation.navigate(route) };
  const hidden = useTabBarHidden();
  // Lot C1, tour 2 : masquée sans être démontée (l'accès flottant garde ses données) ; `display: none` plutôt que
  // l'opacité : sur le web, les zones d'appui des onglets restaient actives sous une feuille.
  return (
    <View
      pointerEvents={hidden ? "none" : "box-none"}
      style={[styles.floating, hidden ? styles.hidden : null]}
      aria-hidden={hidden}
      testID={hidden ? "persona-tabbar-hidden" : "persona-tabbar"}
    >
      {/* Lot 43 : l'accès flottant, au-dessus de la barre dès J-7 (toutes les casquettes qui ont un accès). */}
      <NextAccessBar routeKey={current} tabId={current ? routes[current] : undefined} />
      <TabBar
        tabs={tabs}
        active={(current ? routes[current] : undefined) ?? tabs[0]?.id ?? ""}
        safeBottom={insets.bottom}
        onSelect={(id) => {
          const route = Object.keys(routes).find((name) => routes[name] === id);
          if (route) navigation.navigate(route);
        }}
      />
    </View>
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
  const { panHandlers, control, blocked } = useTabSwipe(onSwipe);
  const { reducedMotion } = useTheme();
  // Pages natives : le geste est natif, sauf animations réduites (fondu, geste d'avant).
  const pages = useMemo(
    () => tabIds.map((id) => Object.keys(routes).find((name) => routes[name] === id)).filter((n) => n !== undefined),
    [tabIds, routes],
  );
  if (PagerTabs) {
    return (
      <TabSwipeContext.Provider value={control}>
        <View style={styles.fill} {...(reducedMotion ? panHandlers : null)} testID="persona-tabs">
          <PagerTabs
            initialRouteName={initialRouteName}
            backBehavior={backBehavior}
            pages={pages}
            swipeEnabled={!reducedMotion && !blocked}
            tabBar={(props) => <PersonaTabBar {...props} tabs={tabs} routes={routes} navigator={navigator} />}
          >
            {children}
          </PagerTabs>
        </View>
      </TabSwipeContext.Provider>
    );
  }
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
          tabBar={(props) => (
            <PersonaTabBar
              state={props.state}
              navigation={props.navigation}
              tabs={tabs}
              routes={routes}
              navigator={navigator}
            />
          )}
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
  floating: { position: "absolute", left: 0, right: 0, bottom: 0 },
  hidden: { display: "none" },
  // Version web (recette) : glisser à la souris sélectionnerait le texte, et une sélection interrompt le geste.
  noSelect: { userSelect: "none" },
});
