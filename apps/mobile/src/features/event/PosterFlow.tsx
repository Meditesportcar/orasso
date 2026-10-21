// Écran de flux « à affiche » (lot C2b, prototype `s-event` et `s-crew`) : pas de barre du haut, la photo ou l'affiche
// occupe toute la largeur en tête de la page, avec la pastille O et la croix flottantes (`.ev-float`) ; le contenu
// remonte de 8 px sur l'image (`.ev-body`). Mêmes fond, zone des feuilles et action fixe en bas que `FlowScreen`.
import { Ground, Icon, Monogram, OliveActivityProvider, tokens, useTheme } from "@orasso/design-system/native";
import { useIsFocused } from "expo-router";
import { type ReactNode, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { KeyboardSafe } from "@/ui/KeyboardSafe";
import { OverlayProvider, OverlaySlot } from "@/ui/Overlay";

const { space2, space3, space4, space6 } = tokens.spacing;

export function PosterFlow({
  hero,
  children,
  footer,
  overlays,
  onClose,
  onRefresh,
  testID,
}: {
  /** La tête pleine largeur (affiche, photo) ; les boutons flottants se posent dessus. */
  hero: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  overlays?: ReactNode;
  onClose: () => void;
  onRefresh?: () => Promise<unknown>;
  testID?: string;
}) {
  const { t } = useTheme();
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  return (
    <OliveActivityProvider active={focused}>
      <OverlayProvider>
        <Ground style={styles.fill}>
          <KeyboardSafe style={styles.fill}>
            <ScrollView
              style={styles.fill}
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              testID={testID}
              refreshControl={
                onRefresh ? (
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
                ) : undefined
              }
            >
              <View style={[styles.hero, { backgroundColor: t.color.bar }]}>
                {hero}
                <View style={[styles.float, { top: insets.top + space3 + 2 }]} pointerEvents="box-none">
                  <View style={[styles.pill, { backgroundColor: `${t.color.night}99` }]}>
                    <Monogram size={32} tone="dark" />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Fermer"
                    onPress={onClose}
                    style={[styles.close, { backgroundColor: `${t.color.night}8c` }]}
                    testID="flow-close"
                  >
                    <Icon name="close" size={20} color={t.color.nightInk} />
                  </Pressable>
                </View>
              </View>
              <View style={styles.body}>{children}</View>
            </ScrollView>
            {footer ? <View style={[styles.footer, { paddingBottom: space3 + insets.bottom }]}>{footer}</View> : null}
          </KeyboardSafe>
          {overlays}
          <OverlaySlot />
        </Ground>
      </OverlayProvider>
    </OliveActivityProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingBottom: space6 * 2 },
  hero: { width: "100%", position: "relative", overflow: "hidden" },
  float: {
    position: "absolute",
    left: space3,
    right: space3,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 5,
  },
  pill: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  close: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  body: { marginTop: -space2, paddingHorizontal: space4, paddingTop: space3 + 2, gap: space4 + 2 },
  footer: { paddingHorizontal: space4, paddingTop: space2, gap: space2 },
});
