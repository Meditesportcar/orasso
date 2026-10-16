// Moi, derrière l'avatar : profil minimal, points et grade de la saison, thème de l'appli, déconnexion. Les casquettes
// (structures, pro, prestataire) et les réglages complets viennent plus tard.

import {
  Button,
  Chip,
  ChipRow,
  Plate,
  Text,
  type ThemePreference,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import { gradeLabels, type PointKind, pointKindLabels } from "@orasso/shared";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/endpoints";
import { formatShortDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Avatar } from "@/ui/Avatar";
import { Muted } from "@/ui/Muted";
import { plateText } from "@/ui/plateText";
import { FlowScreen, SectionTitle } from "@/ui/Screens";

const { space1, space2, space3 } = tokens.spacing;

const themeChoices: { value: ThemePreference; label: string }[] = [
  { value: "beton", label: "Béton" },
  { value: "sable", label: "Sable" },
  { value: "auto", label: "Selon l'appareil" },
];

export default function Moi() {
  const { t, preference, setPreference } = useTheme();
  const router = useRouter();
  const { me, signOut } = useSession();
  const points = useApi(() => api.points(), [], { cacheKey: "points" });
  const profile = me?.profile;
  const p = points.data;

  return (
    <FlowScreen title="Moi" onClose={() => (router.canGoBack() ? router.back() : router.replace("/accueil"))}>
      <Plate style={styles.head}>
        <Avatar url={profile?.avatarUrl} pseudo={profile?.pseudo} size={56} />
        <View style={styles.headText}>
          <Text variant="posterL" color={t.color.plateInk}>
            {profile?.pseudo}
          </Text>
          <Text variant="meta" color={t.color.plateMuted}>
            {me?.user.email}
          </Text>
        </View>
      </Plate>

      <SectionTitle>Points et grade</SectionTitle>
      <Plate style={styles.block}>
        <Text variant="posterM" color={t.color.plateInk}>
          {profile ? `${gradeLabels[profile.grade]} · ${profile.pointsSeason} pts` : ""}
        </Text>
        <Text variant="body" color={t.color.plateMuted}>
          {p?.next
            ? `Encore ${Math.max(0, p.next.threshold - p.pointsSeason)} points pour passer ${gradeLabels[p.next.grade]}. `
            : "Grade maximal de la saison. "}
          {p ? `${p.season.name}.` : ""}
        </Text>
        {p?.entries.slice(0, 6).map((entry) => (
          <View key={entry.id} style={styles.entry}>
            <Text variant="meta" color={t.color.plateMuted} style={styles.entryDate}>
              {formatShortDate(entry.at)}
            </Text>
            <Text variant="body" color={t.color.plateInk} style={styles.entryLabel}>
              {entry.event?.title ?? pointKindLabels[entry.kind as PointKind] ?? entry.kind}
              {entry.event ? ` · ${pointKindLabels[entry.kind as PointKind] ?? entry.kind}` : ""}
            </Text>
            <Text variant="bodyStrong" color={entry.points < 0 ? plateText.alert : t.color.plateInk}>
              {entry.points > 0 ? `+${entry.points}` : `${entry.points}`.replace("-", "−")}
            </Text>
          </View>
        ))}
        {p && p.pending.length > 0 ? (
          <Text variant="body" color={plateText.accent}>
            Pointage en attente : {p.pending.map((x) => x.title).join(", ")}.
          </Text>
        ) : null}
      </Plate>

      <SectionTitle>Thème</SectionTitle>
      <ChipRow>
        {themeChoices.map((choice) => (
          <Chip key={choice.value} selected={preference === choice.value} onPress={() => setPreference(choice.value)}>
            {choice.label}
          </Chip>
        ))}
      </ChipRow>
      <Muted variant="caption">
        Sable est fait pour le plein soleil. « Selon l'appareil » suit le mode clair ou sombre du téléphone.
      </Muted>

      <SectionTitle>Compte</SectionTitle>
      <Button
        variant="plate"
        icon="back"
        onPress={async () => {
          await signOut();
          router.replace("/auth");
        }}
        fullWidth
      >
        Me déconnecter
      </Button>
      <Text variant="caption" color={t.color.inkFaint}>
        Orasso {Constants.expoConfig?.version ?? ""}
      </Text>
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: space3, padding: space3 },
  headText: { flex: 1, gap: space1 },
  block: { gap: space2, padding: space3 },
  entry: { flexDirection: "row", alignItems: "baseline", gap: space3 },
  entryDate: { width: 52 },
  entryLabel: { flex: 1 },
});
