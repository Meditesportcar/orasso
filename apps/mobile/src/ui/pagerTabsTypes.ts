// Ce que la barre d'onglets reçoit du navigateur de pages (lot M3) : l'état des onglets et de quoi changer d'onglet.
import type { ParamListBase, TabNavigationState } from "expo-router/react-navigation";

export type PagerTabBarProps = {
  state: TabNavigationState<ParamListBase>;
  navigation: { navigate: (route: string) => void };
};
