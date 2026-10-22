// Site de recette (Expo web) : pas de pages natives (`react-native-pager-view` n'existe pas sur le web) ; `PersonaTabs`
// garde les onglets d'Expo Router et le glissement au `PanResponder` (lot 40). Voir `pagerTabs.tsx` (lot M3).
import type { PagerTabs as NativePagerTabs } from "./pagerTabs";

export const PagerTabs: typeof NativePagerTabs | null = null;
