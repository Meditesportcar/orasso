// « Tu viens comment ? » (prototype `s-profil`) : six profils en grille de 3 × 2, et la barre d'onglets du profil choisi
// dessinée sous les tuiles. Premier écran du premier lancement.
import { Button, TabBar, Text, tokens, useTheme } from "@orasso/design-system/native";
import { arriveeLabels, type MainProfile } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { ArriveeScreen } from "@/features/arrivee/ArriveeScreen";
import { arriveeStore, centerTabOf, profileTileOrder, tabSetOfProfile, useArrivee } from "@/features/arrivee/model";
import { ProfileTile } from "@/features/arrivee/ProfileTile";
import { Muted } from "@/ui/Muted";

const { space2, space3 } = tokens.spacing;

export default function ArriveeProfil() {
  const { t } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ next?: string; mode?: string }>();
  const { profile } = useArrivee();
  const social = params.mode === "social";
  const next = params.next?.startsWith("/") ? params.next : undefined;

  // La destination après l'inscription et le mode « Google / Apple » sont gardés pour les écrans suivants.
  useEffect(() => {
    arriveeStore.set({ social, next: next ?? null });
  }, [social, next]);

  const choose = (p: MainProfile) => arriveeStore.set({ profile: p });

  return (
    <ArriveeScreen
      step={0}
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
          {social ? null : (
            <Button variant="plate" icon="profile" fullWidth onPress={() => router.replace("/auth")}>
              {arriveeLabels.alreadyAccount}
            </Button>
          )}
        </>
      }
    >
      <View style={styles.head}>
        <Text variant="posterL" color={t.color.ink} accessibilityRole="header">
          {arriveeLabels.profile.title}
        </Text>
        <Muted variant="body">{arriveeLabels.profile.text}</Muted>
      </View>
      <View style={styles.grid} accessibilityRole="radiogroup">
        {profileTileOrder.map((p) => (
          <ProfileTile key={p} profile={p} selected={profile === p} onPress={() => choose(p)} />
        ))}
      </View>
      <View style={styles.preview}>
        <Muted variant="label">{arriveeLabels.profile.tabsLabel}</Muted>
        {profile ? (
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            testID="tab-preview"
            style={styles.tabs}
          >
            <TabBar set={tabSetOfProfile[profile]} active={centerTabOf(profile)} />
          </View>
        ) : null}
      </View>
    </ArriveeScreen>
  );
}

const styles = StyleSheet.create({
  head: { gap: space2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  preview: { gap: space2 },
  tabs: { marginTop: space3 },
});
