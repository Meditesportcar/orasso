// Écran de flux « à affiche » (lot C2b, prototype `s-event` et `s-crew`) : pas de barre du haut, la photo ou l'affiche
// occupe toute la largeur en tête de la page, avec la pastille O et la croix flottantes (`.ev-float`) ; le contenu
// remonte de 8 px sur l'image (`.ev-body`). Mêmes fond, zone des feuilles et action fixe en bas que `FlowScreen`.
// Lot M3 : zone sûre de la barre d'état. Une bande de la couleur de la tête reste fixée sous l'heure et la batterie :
// en défilant, l'affiche et le texte passent dessous, jamais sous les icônes d'Android (retour 20 de Damien).
// Lot M7 (deux modes d'affichage) : c'est un écran du mode B. `band` est l'emplacement standard de l'en-tête de fiche :
// une bande fixée en haut (l'organisateur de la fiche événement, dessinée par le lot M4), le ✕ à sa place habituelle ;
// elle remplace la pastille O et le ✕ flottants. Le ✕ flottant a la cible tactile de 44 px des autres en-têtes.
// Lot M4 (maquette 4.2) : la bande de l'organisateur garde son aplat (couleur de la barre, filet) sur toute la largeur,
// le ✕ de l'en-tête de fiche à droite ; `heroFloat` se pose en haut de l'affiche quand la bande est là (le pavé J-x).
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

import { FicheHeader } from "@/ui/FicheHeader";
import { KeyboardSafe } from "@/ui/KeyboardSafe";
import { OverlayProvider, OverlaySlot } from "@/ui/Overlay";

const { space2, space3, space4, space6 } = tokens.spacing;
/** Cible de 44 px autour du ✕ de 38 px, comme celui de l'en-tête de fiche. */
const CLOSE_SLOP = { top: 3, bottom: 3, left: 3, right: 3 };

export function PosterFlow({
  hero,
  children,
  footer,
  overlays,
  onClose,
  onRefresh,
  testID,
  liftHero = false,
  band,
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
  /** Lot M7 : bande fixe de l'en-tête de fiche (organisateur), à la place de la pastille O et du ✕ flottants. */
  band?: ReactNode;
  /** Lot M4 : ce qui se pose en haut de l'affiche quand la bande est fixée (le pavé J-x). */
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
          {band ? (
            <View
              style={[
                styles.band,
                { backgroundColor: t.color.bar, borderBottomColor: t.color.barEdge, boxShadow: t.shadow.shadowBarTop },
              ]}
              testID="org-band"
            >
              <FicheHeader band={band} onClose={onClose} />
            </View>
          ) : null}
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
                {band ? (
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
                      hitSlop={CLOSE_SLOP}
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
          {band ? null : (
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
  // Lot M4 : la bande de l'organisateur au-dessus de l'affiche (aplat de la barre, filet en bas).
  band: { borderBottomWidth: 2, zIndex: 20 },
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
