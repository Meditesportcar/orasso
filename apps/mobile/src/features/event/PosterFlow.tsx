// Écran de flux « à affiche » (lot C2b, prototype `s-event` et `s-crew`) : pas de barre du haut, la photo ou l'affiche
// occupe toute la largeur en tête de la page, avec la pastille O et la croix flottantes (`.ev-float`) ; le contenu
// remonte de 8 px sur l'image (`.ev-body`). Mêmes fond, zone des feuilles et action fixe en bas que `FlowScreen`.
// Lot M3 : zone sûre de la barre d'état. Une bande de la couleur de la tête reste fixée sous l'heure et la batterie :
// en défilant, l'affiche et le texte passent dessous, jamais sous les icônes d'Android (retour 20 de Damien).
// Lot M4 : `header`, un en-tête de fiche fixé en haut (mode B : la bande de l'organisateur de la fiche événement), qui
// remplace la pastille O et la croix flottantes et porte lui-même la zone sûre ; `heroFloat` se pose sur l'affiche.
import {
  Ground,
  Icon,
  Monogram,
  OliveActivityProvider,
  tokens,
  useFlowChrome,
  useTheme,
} from "@orasso/design-system/native";
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
  liftHero = false,
  header,
  heroFloat,
}: {
  /** La tête pleine largeur (affiche, photo) ; les boutons flottants se posent dessus. */
  hero: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  overlays?: ReactNode;
  onClose: () => void;
  onRefresh?: () => Promise<unknown>;
  testID?: string;
  /** Lot M3 : la tête passe au-dessus du corps, sans découpe (affiche qui grandit depuis la liste). */
  liftHero?: boolean;
  /** Lot M4 : en-tête fixé en haut (zone sûre comprise) ; sans lui, pastille O et croix flottantes. */
  header?: ReactNode;
  /** Lot M4 : ce qui se pose en haut de l'affiche quand l'en-tête est fixé (le pavé J-x). */
  heroFloat?: ReactNode;
}) {
  const { t } = useTheme();
  const focused = useIsFocused();
  // Socle C1 : un écran de flux retire la barre d'onglets et l'accès flottant tant qu'il est affiché.
  useFlowChrome(focused);
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  return (
    <OliveActivityProvider active={focused}>
      <OverlayProvider>
        <Ground paused={!focused} style={styles.fill}>
          {header}
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
              <View style={[styles.hero, liftHero ? styles.heroLifted : null, { backgroundColor: t.color.bar }]}>
                {hero}
                {header ? (
                  heroFloat ? (
                    <View style={[styles.float, { top: 7 }]} pointerEvents="box-none">
                      {heroFloat}
                    </View>
                  ) : null
                ) : (
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
                )}
              </View>
              <View style={styles.body}>{children}</View>
            </ScrollView>
            {footer ? <View style={[styles.footer, { paddingBottom: space3 + insets.bottom }]}>{footer}</View> : null}
          </KeyboardSafe>
          {header ? null : (
            <View
              pointerEvents="none"
              style={[styles.statusBar, { height: insets.top, backgroundColor: t.color.bar }]}
              testID="status-bar-guard"
            />
          )}
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
  // Lot M3 : sans découpe et au-dessus du corps, pour que l'affiche grandisse depuis sa place dans la liste.
  heroLifted: { overflow: "visible", zIndex: 1 },
  statusBar: { position: "absolute", left: 0, right: 0, top: 0, zIndex: 10 },
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
