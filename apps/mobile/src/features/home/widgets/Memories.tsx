// Bloc « Souvenirs » de l'Accueil (lot R7j, maquette R7.10 `a-souv`) : « Il y a un an, jour pour jour : Tu étais à … », la
// photo masquée de ma voiture (sinon l'affiche), « Voir » mène à la page du souvenir. Le bloc n'existe que les jours où
// il y a un souvenir (`GET /me/home` renvoie `memories: null` sinon). Le bouton « En story » est posé par R7f4 sur la page.
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { type HomeMemory, type MemoryItem, memoryLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";

import { MemoryAlbumLine } from "@/features/albums/MemoryAlbumLine";
import { MemoryPhoto } from "@/features/memories/MemoryPhoto";
import { useTitleFit } from "@/features/memories/useTitleFit";
import { MemoryShareButton } from "@/features/share/MemoryShareButton";
import { PosterSurface, SmButton } from "@/ui/Kit";
import { SecH } from "../fanBlocks";

const { space2, space3 } = tokens.spacing;

export function Memories({ data }: { data: HomeMemory }) {
  return (
    <View style={styles.wrap} testID="home-memories">
      <SecH title={memoryLabels.title} />
      {data.items.map((m) => (
        <MemoryPoster key={m.eventId} m={m} />
      ))}
    </View>
  );
}

function MemoryPoster({ m }: { m: MemoryItem }) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { fontScale } = useWindowDimensions();
  // Police du système agrandie : les boutons passent l'un sous l'autre, comme sur la page (aucun libellé sur deux lignes).
  const stacked = fontScale >= 1.15;
  const fit = useTitleFit(memoryLabels.headline(m.title), 24, space3 + 4);
  const open = () => router.push({ pathname: "/souvenir/[eventId]", params: { eventId: m.eventId } });
  return (
    <PosterSurface style={styles.card} testID={`home-memory-${m.eventId}`}>
      <Pressable
        onPress={open}
        accessibilityRole="link"
        accessibilityLabel={memoryLabels.cardTitle(m.yearsAgo, m.title)}
      >
        <MemoryPhoto memory={m} height={200} fade stamp={72} />
      </Pressable>
      <View style={styles.body} onLayout={fit.onLayout}>
        <Text variant="label" color={c.accentText}>
          {memoryLabels.eyebrow(m.yearsAgo)}
        </Text>
        <Text variant="posterXl" color={c.posterInk} style={fit.style} testID="home-memory-title">
          {memoryLabels.headline(m.title)}
        </Text>
        {m.car ? (
          <Text variant="caption" color={c.posterMuted} testID="home-memory-car">
            {memoryLabels.plateauLine(m.car.label, m.car.rank, m.car.total)}
          </Text>
        ) : null}
        <MemoryAlbumLine memory={m} testID="home-memory-album" />
        <View style={[styles.actions, stacked && styles.actionsStacked]} testID="home-memory-actions">
          {/* Place du bouton « En story » (lot R7f4) : il passe en premier, ce composant ne rend rien d'ici là. */}
          <MemoryShareButton memory={m} />
          <SmButton
            kind="s"
            icon="stamp"
            onPress={open}
            style={stacked ? styles.stretch : styles.grow}
            testID="home-memory-open"
          >
            {memoryLabels.see}
          </SmButton>
          <SmButton
            kind="s"
            icon="grid"
            onPress={() => router.push({ pathname: "/e/[slug]/plateau", params: { slug: m.slug } })}
            style={stacked ? styles.stretch : styles.grow}
            testID="home-memory-plateau"
          >
            {memoryLabels.seePlateau}
          </SmButton>
        </View>
      </View>
    </PosterSurface>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space2 },
  card: { borderRadius: 24, overflow: "hidden" },
  body: { marginTop: -8, paddingHorizontal: space3 + 4, paddingBottom: space3 + 4, gap: space2 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space2 + 2 },
  actionsStacked: { flexDirection: "column", flexWrap: "nowrap" },
  grow: { flex: 1, minWidth: 120 },
  stretch: { alignSelf: "stretch" },
});
