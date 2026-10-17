// Morceaux communs à la feuille « Mes casquettes » (barre du haut) et à la section « Mes casquettes » de Moi.
import { Button, Chip, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { adminAppLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { siteUrl } from "@/api";
import { usePersona } from "@/lib/persona";
import { isActive, personaKindLabels, personaOfEntry } from "@/lib/personaModel";
import { useSession } from "@/lib/session";
import { Avatar } from "@/ui/Avatar";

const { space1, space2, space3 } = tokens.spacing;

/** Créer une casquette : la structure et le profil prestataire se créent dans l'appli (lots 21 et 22), la fiche pro sur le site. */
const CREATIONS = [
  { kind: "organizer", label: "Créer une structure", path: "/app/structure/nouvelle" },
  { kind: "pro", label: "Créer une fiche pro", path: "/app/pro/nouvelle" },
  { kind: "provider", label: "Créer un profil prestataire", path: "/app/prestataire" },
] as const;

/** Une ligne par casquette du compte ; l'appui change de casquette (`onPicked` : fermer la feuille, par exemple). */
export function PersonaRows({ onPicked }: { onPicked?: () => void }) {
  const { t } = useTheme();
  const { me } = useSession();
  const { persona, entries, choose } = usePersona();
  return (
    <>
      {entries.map((entry) => {
        const active = isActive(persona, entry);
        const fan = entry.kind === "fan";
        return (
          <Pressable
            key={`${entry.kind}:${entry.id}`}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${entry.label}, ${personaKindLabels[entry.kind]}${active ? ", casquette active" : ""}`}
            onPress={() => {
              onPicked?.();
              if (!active) choose(personaOfEntry(entry));
            }}
            testID={`casquette-${entry.kind}`}
          >
            <Plate style={styles.row}>
              <Avatar
                url={fan ? me?.profile.avatarUrl : entry.logoUrl}
                pseudo={fan ? me?.profile.pseudo : entry.label}
                size={40}
              />
              <View style={styles.text}>
                <Text variant="bodyStrong" color={t.color.plateInk}>
                  {fan ? (me?.profile.pseudo ?? entry.label) : entry.label}
                </Text>
                <Text variant="meta" color={t.color.plateMuted}>
                  {entry.assisted ? adminAppLabels.assistanceBannerReadOnly : personaKindLabels[entry.kind]}
                </Text>
              </View>
              {active ? (
                <Chip surface="plate" selected>
                  Active
                </Chip>
              ) : entry.badge > 0 ? (
                <Chip surface="plate" variant="accent">{`${entry.badge} à traiter`}</Chip>
              ) : null}
            </Plate>
          </Pressable>
        );
      })}
    </>
  );
}

/** Créer une structure / une fiche pro / un profil prestataire (on n'a qu'une fiche pro et qu'un profil prestataire). */
export function CreateCasquettes({ onNavigate }: { onNavigate?: () => void } = {}) {
  const { entries } = usePersona();
  const router = useRouter();
  return (
    <>
      {CREATIONS.filter((c) => c.kind === "organizer" || !entries.some((e) => e.kind === c.kind)).map((c) => (
        <Button
          key={c.kind}
          variant="plate"
          icon="add"
          fullWidth
          // Structure (lot 22) et profil prestataire (lot 21) se créent dans l'appli ; la fiche pro, sur le site.
          onPress={() => {
            onNavigate?.();
            if (c.kind === "provider") router.push("/prestataire/nouveau");
            else if (c.kind === "organizer") router.push("/structure/nouvelle");
            else void Linking.openURL(siteUrl(c.path));
          }}
        >
          {c.label}
        </Button>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space3, padding: space2 + 4 },
  text: { flex: 1, gap: space1 },
});
