// Les photos d'un souvenir « Il y a un an » (lot R9f, maquette R9.7 `an`) : « N photos de ta <voiture> · <média> » et « Revoir mes photos »
// (« Tes photos »). Rien sans identification : l'API ne sert pas `albumPhotos`.
import { Text, useTheme } from "@orasso/design-system/native";
import { albumTagLabels as L, type MemoryItem, mentionsSummary } from "@orasso/shared";
import { useRouter } from "expo-router";
import { StyleSheet } from "react-native";

import { SmButton } from "@/ui/Kit";

export function MemoryAlbumLine({
  memory,
  tone = "poster",
  testID = "memory-album-line",
}: {
  memory: Pick<MemoryItem, "albumPhotos" | "car">;
  /** `poster` : sur l'affiche (texte d'affiche) ; `plain` : sur le fond de l'écran. */
  tone?: "poster" | "plain";
  testID?: string;
}) {
  const { t } = useTheme();
  const router = useRouter();
  const s = mentionsSummary(memory.albumPhotos, memory.car?.label ?? null);
  const albums = memory.albumPhotos ?? [];
  if (!s || albums.length === 0) return null;
  return (
    <>
      <Text variant="caption" color={tone === "poster" ? t.color.posterMuted : t.color.inkMuted} testID={testID}>
        {s.line}
      </Text>
      {/* Un lien par album : le souvenir peut en annoncer plusieurs, chacun s'ouvre. */}
      {albums.map((m, i) => (
        <SmButton
          key={m.albumId}
          kind="s"
          icon="camera"
          onPress={() => router.push(`/album/${m.albumId}/mes-photos` as never)}
          style={styles.stretch}
          testID={`${testID}-open`}
        >
          {albums.length > 1 ? L.screens.reviewAlbum(m.mediaName, i + 1) : L.reviewMyPhotos}
        </SmButton>
      ))}
    </>
  );
}

const styles = StyleSheet.create({ stretch: { alignSelf: "stretch" } });
