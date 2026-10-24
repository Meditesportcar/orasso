// « Tu viens comment ? » (lot C3, artefact `s-profil`) : six profils en grille de 3 × 2, puis « Ta barre d'onglets »
// (`.tabprev` : la barre du profil choisi, en miniature, le O au centre). La croix revient à l'accueil ; « J'ai déjà un
// compte » est sur l'accueil, plus ici.
import { Button, Icon, type IconName, tabSets } from "@orasso/design-system/native";
import { arriveeLabels, type MainProfile, profileMissing } from "@orasso/shared";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { ArriveeScreen, ObHead } from "@/features/arrivee/ArriveeScreen";
import { MissingLine } from "@/features/arrivee/MissingLine";
import { arriveeStore, profileTileOrder, tabSetOfProfile, useArrivee } from "@/features/arrivee/model";
import { ProfileTile } from "@/features/arrivee/ProfileTile";
import { A } from "@/features/tuto/anim";
import { T, useArt } from "@/features/tuto/art";
import { ArtIcon } from "@/features/tuto/icons";
import { OMono } from "@/features/tuto/posters";

/** `.tabprev` : la barre d'onglets du profil, en miniature (les onglets arrivent l'un après l'autre, 40 ms d'écart). */
function TabPreview({ profile }: { profile: MainProfile }) {
  const a = useArt();
  return (
    <View
      style={[styles.tabprev, { backgroundColor: a.bar }]}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="tab-preview"
    >
      {tabSets[tabSetOfProfile[profile]].map((tab, i) => {
        const center = "center" in tab && tab.center;
        const color = center ? a.accent : a.barMuted;
        return (
          <A key={`${profile}-${tab.id}`} k="up" d={i * 0.04} dur={0.22} style={styles.tab}>
            {center ? (
              <OMono size={24} color={a.accent} />
            ) : (
              <Icon name={tab.icon as IconName} size={20} color={color} />
            )}
            <T k="btn" size={9} lh={11} color={color} style={styles.tabLabel}>
              {tab.label}
            </T>
          </A>
        );
      })}
    </View>
  );
}

export default function ArriveeProfil() {
  const a = useArt();
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string }>();
  const { profile } = useArrivee();
  const next = params.next?.startsWith("/") ? params.next : undefined;

  // La destination après l'inscription (lien partagé ouvert avant) est gardée pour les écrans suivants. L'artefact
  // ouvre l'écran avec « Exposant » coché : même défaut ici.
  useEffect(() => {
    arriveeStore.set({ next: next ?? null, ...(arriveeStore.get().profile ? {} : { profile: "exhibitor" }) });
  }, [next]);

  const choose = (p: MainProfile) => arriveeStore.set({ profile: p });
  // Lot R3d : l'étape affichée est gardée avec le brouillon (reprise après une fermeture de l'appli).
  useFocusEffect(useCallback(() => arriveeStore.set({ step: "profil" }), []));

  return (
    <ArriveeScreen
      step={0}
      onClose={() =>
        router.canGoBack() ? router.back() : router.replace({ pathname: "/arrivee", params: next ? { next } : {} })
      }
      footer={
        <>
          <Button
            variant="primary"
            icon="next"
            fullWidth
            disabled={!profile}
            onPress={() => router.push("/arrivee/departement")}
          >
            {arriveeLabels.next}
          </Button>
          <MissingLine missing={profileMissing(profile)} />
          {
            // Arrivée d'un lien partagé (« Candidater » sur un événement → inscription) : qui a déjà un compte doit pouvoir
            // se connecter sans repasser par l'accueil, en gardant la destination (relecture Codex du lot C3).
            next ? (
              <Pressable
                onPress={() => router.replace({ pathname: "/auth", params: { next } })}
                accessibilityRole="button"
                testID="arrivee-profil-compte"
                style={styles.ghost}
              >
                <ArtIcon name="user" size={20} color={a.ink} />
                <T k="btn" size={14} lh={17} color={a.ink}>
                  {arriveeLabels.alreadyAccount}
                </T>
              </Pressable>
            ) : null
          }
        </>
      }
    >
      <ObHead title={arriveeLabels.profile.title} text={arriveeLabels.profile.text} />
      <View style={styles.grid} accessibilityRole="radiogroup">
        {profileTileOrder.map((p) => (
          <ProfileTile key={p} profile={p} selected={profile === p} onPress={() => choose(p)} />
        ))}
      </View>
      <View style={styles.preview}>
        <T k="label" color={a.muted}>
          {arriveeLabels.profile.tabsLabel}
        </T>
        {profile ? <TabPreview profile={profile} /> : null}
      </View>
    </ArriveeScreen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  preview: { gap: 8 },
  tabprev: { flexDirection: "row", borderRadius: 18, paddingVertical: 10, paddingHorizontal: 4, gap: 2 },
  tab: { flex: 1, alignItems: "center", gap: 4 },
  tabLabel: { textAlign: "center", letterSpacing: 0 },
  ghost: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 40,
    paddingVertical: 10,
  },
});
