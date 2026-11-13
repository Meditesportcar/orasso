// La zone qui défile de l'onglet Crew (petit lot de fin, partie E) : la rangée d'onglets du crew reste collée en haut (comme
// celle du Profil), et le défilement ne colle que ses enfants directs : le haut du crew (`CrewSpace`) pose donc à plat ses
// blocs ici, `sticky` étant le rang de la rangée collée parmi eux. Le tirer-pour-recharger et la position (pour la pastille
// « nouvelle publication » du fil) restent à `CrewTab`.
import { tokens, useTheme } from "@orasso/design-system/native";
import { type MutableRefObject, type ReactNode, type RefObject, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { space3, space4 } = tokens.spacing;

/** Place laissée sous le contenu d'un onglet (comme `TabScreen`) : la barre d'onglets flottante passe par-dessus. */
const TAB_BODY_BOTTOM = 150;

export type CrewScrollProps = {
  scrollRef: RefObject<ScrollView | null>;
  /** La position de la zone, tenue à jour (lue par `CrewFeedScroller`). */
  scrollY: MutableRefObject<number>;
  onRefresh: () => Promise<void>;
};

export function CrewScroll({
  scrollRef,
  scrollY,
  onRefresh,
  sticky,
  children,
}: CrewScrollProps & {
  /** Le rang (parmi les enfants, sans `null`) de la rangée qui reste collée en haut. */
  sticky?: number;
  /** Une liste à plat, sans `null`, chaque élément portant sa clé. */
  children: ReactNode[];
}) {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  return (
    <ScrollView
      ref={scrollRef}
      style={styles.fill}
      contentContainerStyle={[styles.content, { paddingBottom: TAB_BODY_BOTTOM + insets.bottom }]}
      stickyHeaderIndices={sticky === undefined ? undefined : [sticky]}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={32}
      onScroll={(e) => {
        scrollY.current = e.nativeEvent.contentOffset.y;
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={t.color.accent}
          onRefresh={async () => {
            setRefreshing(true);
            try {
              await onRefresh();
            } finally {
              setRefreshing(false);
            }
          }}
        />
      }
      testID="crew-tab"
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: space4, paddingTop: space3, gap: space3 },
});
