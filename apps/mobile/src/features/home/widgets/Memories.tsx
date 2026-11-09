// Bloc « Souvenirs » de l'Accueil (lot R7j, maquette R7.10 `a-souv`) : « Il y a un an, jour pour jour : Tu étais à … », la
// photo masquée de ma voiture (sinon l'affiche), « Voir » mène à la page du souvenir. Le bloc n'existe que les jours où
// il y a un souvenir (`GET /me/home` renvoie `memories: null` sinon). Le bouton « En story » est posé par R7f4 sur la page.
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { type HomeMemory, memoryLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { MemoryPhoto } from "@/features/memories/MemoryPhoto";
import { PosterSurface, SmButton } from "@/ui/Kit";
import { SecH } from "../fanBlocks";

const { space2, space3 } = tokens.spacing;

export function Memories({ data }: { data: HomeMemory }) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const open = (eventId: string) => router.push({ pathname: "/souvenir/[eventId]", params: { eventId } });
  return (
    <View style={styles.wrap} testID="home-memories">
      <SecH title={memoryLabels.title} />
      {data.items.map((m) => (
        <PosterSurface key={m.eventId} style={styles.card} testID={`home-memory-${m.eventId}`}>
          <Pressable
            onPress={() => open(m.eventId)}
            accessibilityRole="link"
            accessibilityLabel={memoryLabels.cardTitle(m.yearsAgo, m.title)}
          >
            <MemoryPhoto memory={m} height={200} fade />
          </Pressable>
          <View style={styles.body}>
            <Text variant="label" color={c.accentText}>
              {memoryLabels.eyebrow(m.yearsAgo)}
            </Text>
            <Text variant="posterXl" color={c.posterInk} style={styles.title}>
              {memoryLabels.headline(m.title)}
            </Text>
            <View style={styles.actions}>
              <SmButton kind="s" icon="stamp" onPress={() => open(m.eventId)} testID="home-memory-open">
                {memoryLabels.see}
              </SmButton>
            </View>
          </View>
        </PosterSurface>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space2 },
  card: { borderRadius: 24, overflow: "hidden" },
  body: { marginTop: -30, paddingHorizontal: space3 + 4, paddingBottom: space3 + 4, gap: space2 },
  title: { fontSize: 28, lineHeight: 28 },
  actions: { flexDirection: "row", gap: space2 + 2 },
});
