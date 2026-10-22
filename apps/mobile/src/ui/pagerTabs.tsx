// Onglets en pages natives (lot M3, fluidité ; demande de Damien du 23/10 : « un vrai feuilletage ») : les onglets
// d'une casquette sont les pages d'un `PagerView` (ViewPager2 sur Android). La page suit le doigt sur le fil graphique
// natif, à 60 images/s, et l'onglet voisin est déjà monté : au lâcher, rien ne charge.
// - Navigateur Expo Router maison (`withLayoutContext` + `TabRouter`) : mêmes routes, même barre (`tabBar`), même
//   retour arrière que les onglets d'avant ; l'appui sur la barre change de page sans animation, comme avant.
// - Préchargement : la page ouverte se monte d'abord, puis les autres une à une (voisines d'abord), sans bloquer
//   l'image ; un onglet visité reste monté (cache d'abord : il affiche sa dernière version et se rafraîchit derrière).
// - Les pages masquées d'un groupe (`href: null` : assistant, modifier…) se posent par-dessus les pages, avec la barre.
// - Le geste natif ne démarre que sur un glissement nettement horizontal (pente du ViewPager2) ; les listes
//   horizontales et le curseur le gardent pour eux (ils bloquent l'interception native), une feuille ouverte ou un
//   écran qui le demande (`useTabSwipeDisabled` : carte, tri) le coupent (`swipeEnabled`).
// Le site de recette (Expo web) garde les onglets d'avant (`pagerTabs.web.tsx`).
import { APP_BAR_HEIGHT, tokens } from "@orasso/design-system/native";
import { withLayoutContext } from "expo-router";
import {
  type DefaultNavigatorOptions,
  type EventMapBase,
  type ParamListBase,
  type TabNavigationState,
  TabRouter,
  type TabRouterOptions,
  useNavigationBuilder,
} from "expo-router/react-navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import PagerView, { type PagerViewOnPageSelectedEvent } from "react-native-pager-view";

import type { PagerTabBarProps } from "./pagerTabsTypes";
import { EVENT_LIST_BLOCKS, Waiting } from "./Waiting";

const { space4, space6 } = tokens.spacing;

/** Délai avant le premier préchargement (la page ouverte peint d'abord), puis entre deux pages. */
const PRELOAD_FIRST_MS = 350;
const PRELOAD_STEP_MS = 220;

type Props = DefaultNavigatorOptions<
  ParamListBase,
  string | undefined,
  TabNavigationState<ParamListBase>,
  object,
  EventMapBase,
  unknown
> &
  TabRouterOptions & {
    /** Les routes qui sont des pages, dans l'ordre de la barre ; les autres sont des pages masquées. */
    pages: readonly string[];
    tabBar: (props: PagerTabBarProps) => ReactNode;
    /** Le geste de page est permis (pas de feuille ouverte, pas d'écran qui le coupe, animations permises). */
    swipeEnabled: boolean;
    /** Une page a été choisie au doigt (pas par la barre). */
    onSwiped?: (route: string) => void;
  };

function PagerTabNavigator({
  id,
  initialRouteName,
  backBehavior,
  children,
  screenOptions,
  screenListeners,
  pages,
  tabBar,
  swipeEnabled,
  onSwiped,
}: Props) {
  const { state, navigation, descriptors, NavigationContent } = useNavigationBuilder(TabRouter, {
    id,
    initialRouteName,
    backBehavior,
    children,
    screenOptions,
    screenListeners,
  });
  const current = state.routes[state.index];
  const pageRoutes = useMemo(
    () => pages.map((name) => state.routes.find((r) => r.name === name)).filter((r) => r !== undefined),
    [pages, state.routes],
  );
  const pageIndex = pageRoutes.findIndex((r) => r.key === current?.key);
  const hidden = current && pageIndex < 0 ? current : null;

  // Pages montées : l'ouverte, les visitées, puis toutes par préchargement progressif.
  const [mounted, setMounted] = useState<ReadonlySet<string>>(() => new Set(current ? [current.key] : []));
  useEffect(() => {
    if (!current || mounted.has(current.key)) return;
    setMounted((m) => new Set([...m, current.key]));
  }, [current, mounted]);
  const order = useRef<string[]>([]);
  if (order.current.length === 0 && pageRoutes.length > 0) {
    const from = Math.max(0, pageIndex);
    order.current = pageRoutes
      .map((r, i) => ({ key: r.key, d: Math.abs(i - from) }))
      .sort((a, b) => a.d - b.d)
      .map((x) => x.key);
  }
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const step = () => {
      const next = order.current.shift();
      if (!next) return;
      setMounted((m) => (m.has(next) ? m : new Set([...m, next])));
      timer = setTimeout(step, PRELOAD_STEP_MS);
    };
    timer = setTimeout(step, PRELOAD_FIRST_MS);
    return () => clearTimeout(timer);
  }, []);

  // La barre (ou un lien) change d'onglet : la page suit, sans animation ; le doigt, lui, a déjà tourné la page.
  const pager = useRef<PagerView>(null);
  const shown = useRef(pageIndex);
  useEffect(() => {
    if (pageIndex < 0 || pageIndex === shown.current) return;
    shown.current = pageIndex;
    pager.current?.setPageWithoutAnimation(pageIndex);
  }, [pageIndex]);
  const onPageSelected = (event: PagerViewOnPageSelectedEvent) => {
    const position = event.nativeEvent.position;
    if (position === shown.current) return;
    shown.current = position;
    const route = pageRoutes[position];
    if (!route) return;
    navigation.navigate(route.name);
    onSwiped?.(route.name);
  };

  // Pages masquées visitées : gardées montées, cachées quand une page est affichée.
  const [hiddenSeen, setHiddenSeen] = useState<readonly string[]>([]);
  useEffect(() => {
    if (hidden && !hiddenSeen.includes(hidden.key)) setHiddenSeen((h) => [...h, hidden.key]);
  }, [hidden, hiddenSeen]);
  const hiddenRoutes = state.routes.filter((r) => hiddenSeen.includes(r.key) || r.key === hidden?.key);

  return (
    <NavigationContent>
      <View style={styles.fill}>
        <PagerView
          ref={pager}
          style={styles.fill}
          initialPage={Math.max(0, pageIndex)}
          scrollEnabled={swipeEnabled && !hidden}
          offscreenPageLimit={Math.max(1, pageRoutes.length - 1)}
          onPageSelected={onPageSelected}
          testID="persona-pages"
        >
          {pageRoutes.map((route) => (
            <View key={route.key} collapsable={false} style={styles.fill}>
              {mounted.has(route.key) ? (
                descriptors[route.key]?.render()
              ) : (
                // Page pas encore préchargée (glissement dans la première seconde) : des squelettes, jamais du vide.
                <View style={styles.placeholder}>
                  <Waiting blocks={EVENT_LIST_BLOCKS} />
                </View>
              )}
            </View>
          ))}
        </PagerView>
        {hiddenRoutes.map((route) => (
          <View
            key={route.key}
            style={[StyleSheet.absoluteFill, route.key === hidden?.key ? null : styles.gone]}
            pointerEvents={route.key === hidden?.key ? "auto" : "none"}
          >
            {descriptors[route.key]?.render()}
          </View>
        ))}
        {tabBar({ state, navigation, descriptors } as unknown as PagerTabBarProps)}
      </View>
    </NavigationContent>
  );
}

/** Le navigateur de pages, branché sur Expo Router (`<PagerTabs>` + `<Tabs.Screen name="…" />`). */
export const PagerTabs = withLayoutContext(PagerTabNavigator);

const styles = StyleSheet.create({
  fill: { flex: 1 },
  gone: { display: "none" },
  placeholder: { flex: 1, paddingTop: APP_BAR_HEIGHT + space6, paddingHorizontal: space4 },
});
