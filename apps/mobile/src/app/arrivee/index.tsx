// L'accueil du premier lancement (lot C3, artefact `s-splash`) : en haut, la battle en tandem autour du O (deux voitures
// driftent, la voiture de tête se gare dans le O), puis le logotype se compose et la signature « Tout le monde à sa
// place. » apparaît ; au milieu, la phrase d'Orasso ; en bas « Commencer » (le flux d'arrivée) et « J'ai déjà un
// compte » (la connexion). Sur le fond de l'appli (lampe et battle). Réduction des animations : logo composé, fondu.
import { Button, Ground, OliveActivityProvider, OpeningBattleLogo } from "@orasso/design-system/native";
import { arriveeLabels } from "@orasso/shared";
import { useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { A } from "@/features/tuto/anim";
import { T, useArt } from "@/features/tuto/art";
import { ArtIcon } from "@/features/tuto/icons";

/** Hauteur du logotype composé pour une largeur donnée (viewBox du logo : 642 × 104). */
const LOGO_RATIO = 104 / 642;

export default function ArriveeAccueil() {
  const a = useArt();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ next?: string }>();
  const next = params.next?.startsWith("/") ? params.next : undefined;
  const [composed, setComposed] = useState(false);
  // `.sp-logo` : toute la largeur, 330 px au plus.
  const logoWidth = Math.min(330, width - 32);

  return (
    <OliveActivityProvider active={focused}>
      <Ground variant="battle" style={styles.fill}>
        <View
          style={[styles.splash, { paddingTop: insets.top + 120, paddingBottom: insets.bottom + 26 }]}
          testID="arrivee-accueil"
        >
          <View style={styles.mid}>
            <View style={{ width: logoWidth, height: logoWidth * LOGO_RATIO }}>
              {/* La scène de la battle déborde du logotype : elle est centrée sur lui, sans pousser la mise en page. */}
              <View style={styles.stage} pointerEvents="none">
                <OpeningBattleLogo logoWidth={logoWidth} tone="auto" onDone={() => setComposed(true)} />
              </View>
            </View>
            {composed ? (
              <A k="fade" d={0.5} dur={0.4}>
                <T k="label" size={12} lh={16} color={a.muted} style={styles.sign}>
                  Tout le monde à sa place.
                </T>
              </A>
            ) : (
              <T k="label" size={12} lh={16} color="transparent" style={styles.sign}>
                Tout le monde à sa place.
              </T>
            )}
          </View>
          <View style={styles.mid}>
            <T k="body" size={17} lh={24.5} color={a.ink} style={styles.lead}>
              Les rassemblements et expos auto du coin, ta place réservée, ton entrée en un scan.
            </T>
          </View>
          <View style={styles.cta}>
            <Button
              variant="primary"
              icon="next"
              fullWidth
              onPress={() => router.push({ pathname: "/arrivee/profil", params: next ? { next } : {} })}
              testID="arrivee-commencer"
            >
              {arriveeLabels.splashStart}
            </Button>
            {/* `.btn.btn-g.btn-w` : un lien pleine largeur (icône personne + capitales), sans fond ni bord. */}
            <Pressable
              onPress={() => router.push({ pathname: "/auth", params: next ? { next } : {} })}
              accessibilityRole="button"
              testID="arrivee-compte"
              style={({ pressed }) => [styles.ghost, pressed ? styles.pressed : null]}
            >
              <ArtIcon name="user" size={20} color={a.ink} />
              <T k="btn" size={14} lh={17} color={a.ink}>
                {arriveeLabels.alreadyAccount}
              </T>
            </Pressable>
          </View>
        </View>
      </Ground>
    </OliveActivityProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  splash: { flex: 1, justifyContent: "space-between", gap: 24, paddingHorizontal: 16, overflow: "hidden" },
  mid: { alignItems: "center", gap: 18 },
  stage: {
    position: "absolute",
    left: -200,
    right: -200,
    top: -200,
    bottom: -200,
    alignItems: "center",
    justifyContent: "center",
  },
  sign: { textAlign: "center", letterSpacing: 1.7, marginTop: -4 },
  lead: { textAlign: "center", maxWidth: 300 },
  cta: { gap: 8 },
  ghost: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 40,
    paddingVertical: 10,
  },
  pressed: { transform: [{ scale: 0.97 }] },
});
