// Étape 2 de « Nouvel album » (lot R9e, maquette `albumH` e2) : « Les photos ». Le compteur « N photos prêtes » (versions web compressées,
// les originaux restent chez le média), « Ajouter » (30 par ouverture du sélecteur), le bloc des plaques repérées avec **une décision pour le
// lot** (« Flouter et ajouter » | « Envoyer telle quelle », « Changer » tant qu'on peut), les vignettes. « Continuer » envoie les photos une à
// une (« 37 / 48 ») puis passe aux détails ; une coupure laisse les photos faites et propose « Reprendre l'envoi ».
import { Button, Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { albumLabels as L } from "@orasso/shared";
import { Image, Pressable, StyleSheet, View } from "react-native";

import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { UploadProgress } from "@/ui/PhotoGrid";
import type { useAlbumUploads } from "./useAlbumUploads";

const { space1, space2, space3 } = tokens.spacing;

type Uploads = ReturnType<typeof useAlbumUploads>;

export function AlbumStep2Photos({
  uploads,
  inAlbum,
  onContinue,
}: {
  uploads: Uploads;
  /** Photos déjà dans l'album (brouillon repris) : elles comptent dans « prêtes » et dans le plafond. */
  inAlbum: number;
  onContinue: () => void;
}) {
  const { t } = useTheme();
  const { items, batch, setBatch, plated, detecting, pending, sending, progress, error } = uploads;
  const ready = inAlbum + items.length;
  const needsDecision = plated > 0 && batch === null;
  const canContinue =
    (ready > 0 && !needsDecision && !detecting && !sending) || (pending === 0 && ready > 0 && !sending);
  const withPlate = items.filter((i) => i.rects.length > 0).length;
  const decidedCount = batch === null ? plated : withPlate;

  return (
    <View style={styles.block}>
      <View style={styles.count} testID="album-count">
        <Text variant="title" color={t.color.ink}>
          {String(ready)}
        </Text>
        <View style={styles.countText}>
          <Text variant="bodyStrong" color={t.color.ink}>
            {L.photosReady}
          </Text>
          <Muted variant="caption">{L.compressedNote}</Muted>
        </View>
        <Button
          variant="secondary"
          icon="add"
          disabled={sending}
          onPress={() => void uploads.pick(inAlbum)}
          testID="album-pick"
        >
          {L.add}
        </Button>
      </View>

      {plated > 0 || batch !== null ? (
        <View
          style={[styles.plate, { borderColor: t.color.line, backgroundColor: t.color.surface }]}
          testID="album-plates"
        >
          <Icon name="eyeOff" size={22} color={t.color.accentText} />
          <View style={styles.plateText}>
            <Text variant="bodyStrong" color={t.color.ink}>
              {batch === "blurred"
                ? L.blurredTitle(decidedCount)
                : batch === "kept"
                  ? L.keptTitle(decidedCount)
                  : L.plateFound(plated)}
            </Text>
            <Muted variant="caption">
              {batch === "blurred" ? L.blurredHint : batch === "kept" ? L.keptHint : L.plateHint(plated)}
            </Muted>
            {batch === null ? (
              <View style={styles.choices}>
                <Button variant="secondary" icon="eyeOff" onPress={() => setBatch("blurred")} testID="album-blur">
                  {L.blurAndAdd}
                </Button>
                <Button variant="secondary" icon="upload" onPress={() => setBatch("kept")} testID="album-keep">
                  {L.sendAsIs}
                </Button>
              </View>
            ) : (
              <Button
                variant="secondary"
                icon="undo"
                disabled={sending}
                onPress={() => setBatch(null)}
                testID="album-change"
              >
                {L.change}
              </Button>
            )}
          </View>
        </View>
      ) : null}

      <View style={styles.grid} testID="album-grid">
        {items.map((i) => (
          <Pressable
            key={i.clientId}
            accessibilityRole="button"
            accessibilityLabel={L.photoRemove}
            disabled={sending || Boolean(i.photoId)}
            onPress={() => uploads.remove(i.clientId)}
            style={[styles.tile, { backgroundColor: t.color.surface }]}
            testID="album-tile"
          >
            <Image source={{ uri: i.uri }} style={styles.img} resizeMode="cover" accessibilityIgnoresInvertColors />
            <View style={[styles.check, { backgroundColor: i.photoId ? t.color.accent : t.color.night }]}>
              <Icon name="check" size={12} color={t.color.nightInk} />
            </View>
          </Pressable>
        ))}
      </View>

      {progress ? <UploadProgress current={progress.current} total={progress.total} /> : null}
      {sending && progress ? (
        <Muted variant="meta" testID="album-progress">
          {L.sendProgress(progress.current, progress.total)}
        </Muted>
      ) : null}
      {error ? (
        <Notice tone="error" testID="album-send-error">
          {error}
        </Notice>
      ) : null}
      {needsDecision ? <Notice testID="album-needs-decision">{L.plateDecision}</Notice> : null}
      <Button
        variant="primary"
        icon={error ? "undo" : "next"}
        fullWidth
        loading={sending}
        disabled={!canContinue}
        onPress={onContinue}
        testID="album-step2-continue"
      >
        {error && pending > 0 ? L.resumeSend : L.continue}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space3 },
  count: { flexDirection: "row", alignItems: "center", gap: space3 },
  countText: { flex: 1, gap: space1 },
  plate: { flexDirection: "row", gap: space3, borderWidth: 1, borderRadius: tokens.radius.radiusMd, padding: space3 },
  plateText: { flex: 1, gap: space2 },
  choices: { gap: space2 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space1 },
  tile: { width: "32%", aspectRatio: 1, borderRadius: tokens.radius.radiusSm, overflow: "hidden" },
  img: { width: "100%", height: "100%" },
  check: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
});
