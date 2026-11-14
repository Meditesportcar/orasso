// Étape 2 de « Nouvel album » (lot R9e, maquette `albumH` e2) : « Les photos ». Le compteur « N photos prêtes » (versions web compressées, les
// originaux restent chez le média), « Ajouter » (30 par ouverture du sélecteur), le bloc des plaques repérées avec **la décision de chaque photo**
// (« Flouter et ajouter » | « Envoyer telle quelle » ; une photo à plaque ajoutée après coup rouvre le bloc pour elle ; « Changer » tant qu'aucun
// ajout n'est parti), les vignettes (une photo ajoutée montre la version du serveur, floutée si « Flouter »). « Continuer » envoie les photos une
// à une (« 37 / 48 ») puis passe aux détails ; une coupure laisse les photos faites et propose « Reprendre l'envoi ». La feuille de réglage
// des plaques est hébergée par l'écran (`overlays`), pas ici.
import { Button, Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type AlbumPhotoView, albumLabels as L } from "@orasso/shared";
import { Image, Pressable, StyleSheet, View } from "react-native";

import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { UploadProgress } from "@/ui/PhotoGrid";
import { AlbumPhoto } from "./AlbumPhoto";
import type { useAlbumUploads } from "./useAlbumUploads";

const { space1, space2, space3 } = tokens.spacing;

type Uploads = ReturnType<typeof useAlbumUploads>;

export function AlbumStep2Photos({
  uploads,
  basePhotos,
  onOpenItem,
  onOpenBase,
  onContinue,
}: {
  uploads: Uploads;
  /** Photos déjà dans le brouillon repris, d'avant cette séance : elles comptent dans « prêtes » et dans le plafond, et se retirent. */
  basePhotos: readonly AlbumPhotoView[];
  onOpenItem: (clientId: string) => void;
  onOpenBase: (photoId: string) => void;
  onContinue: () => void;
}) {
  const { t } = useTheme();
  const { items, plated, counts, canChange, detecting, pending, sending, progress, error, removing } = uploads;
  // Une seule opération à la fois : tant qu'un envoi ou un retrait est en cours, rien d'autre ne part (« Continuer », « Ajouter », tuiles).
  const opBusy = uploads.busy;
  const ready = basePhotos.length + items.length;
  const needsDecision = plated > 0;
  const canContinue = (ready > 0 && !needsDecision && !detecting && !opBusy) || (pending === 0 && ready > 0 && !opBusy);
  const decided = counts.blurred + counts.kept;
  const summary = [
    counts.blurred > 0 ? L.blurredTitle(counts.blurred) : null,
    counts.kept > 0 ? L.keptTitle(counts.kept) : null,
  ]
    .filter(Boolean)
    .join(" · ");

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
          disabled={opBusy}
          onPress={() => void uploads.pick(basePhotos.length)}
          testID="album-pick"
        >
          {L.add}
        </Button>
      </View>

      {plated > 0 || decided > 0 ? (
        <View
          style={[styles.plate, { borderColor: t.color.line, backgroundColor: t.color.surface }]}
          testID="album-plates"
        >
          <Icon name="eyeOff" size={22} color={t.color.accentText} />
          <View style={styles.plateText}>
            <Text variant="bodyStrong" color={t.color.ink}>
              {plated > 0 ? L.plateFound(plated) : summary}
            </Text>
            <Muted variant="caption">
              {plated > 0
                ? L.plateHint(plated)
                : counts.blurred > 0 && counts.kept === 0
                  ? L.blurredHint
                  : counts.kept > 0 && counts.blurred === 0
                    ? L.keptHint
                    : `${L.blurredHint} ${L.keptHint}`}
            </Muted>
            {plated > 0 ? (
              <View style={styles.choices}>
                <Button variant="secondary" icon="eyeOff" onPress={() => uploads.decide("blurred")} testID="album-blur">
                  {L.blurAndAdd}
                </Button>
                <Button variant="secondary" icon="upload" onPress={() => uploads.decide("kept")} testID="album-keep">
                  {L.sendAsIs}
                </Button>
              </View>
            ) : null}
            {decided > 0 && plated > 0 && summary ? <Muted variant="caption">{summary}</Muted> : null}
            {canChange ? (
              <Button variant="secondary" icon="undo" disabled={opBusy} onPress={uploads.reopen} testID="album-change">
                {L.change}
              </Button>
            ) : null}
          </View>
        </View>
      ) : null}

      <View style={styles.grid} testID="album-grid">
        {basePhotos.map((p) => (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            accessibilityLabel={L.photoRemove}
            disabled={opBusy}
            onPress={() => onOpenBase(p.id)}
            style={[styles.tile, { backgroundColor: t.color.surface }]}
            testID="album-tile-base"
          >
            <AlbumPhoto photo={p} style={styles.img} cover />
            <View style={[styles.check, { backgroundColor: t.color.accent }]}>
              <Icon name="check" size={12} color={t.color.nightInk} />
            </View>
            {removing === (p.clientId ?? p.id) ? <TileBadge label={L.removing} testID="album-tile-removing" /> : null}
          </Pressable>
        ))}
        {items.map((i) => (
          <Pressable
            key={i.clientId}
            accessibilityRole="button"
            accessibilityLabel={i.photoId ? L.photoRemove : L.plateSheetTitle}
            // Un cadre posé à la main n'est jamais écrasé : la tuile s'ouvre quand la détection de cette photo est finie.
            disabled={opBusy || (!i.detected && !i.photoId)}
            onPress={() => onOpenItem(i.clientId)}
            style={[styles.tile, { backgroundColor: t.color.surface }]}
            testID="album-tile"
          >
            {i.photoId && i.serverUrl ? (
              // Ajoutée : la version du serveur (floutée si « Flouter »), lue avec la session ; jamais l'original local.
              <AlbumPhoto photo={{ url: i.serverUrl }} style={styles.img} cover />
            ) : (
              <Image source={{ uri: i.uri }} style={styles.img} resizeMode="cover" accessibilityIgnoresInvertColors />
            )}
            <View style={[styles.check, { backgroundColor: i.photoId ? t.color.accent : t.color.night }]}>
              <Icon name="check" size={12} color={t.color.nightInk} />
            </View>
            {removing === i.clientId ? <TileBadge label={L.removing} testID="album-tile-removing" /> : null}
            {sending && !i.photoId ? <TileBadge label={L.sendingTile} testID="album-tile-sending" /> : null}
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

/** « Retrait… » sur la tuile dont le retrait est en cours (elle reste visible jusqu'au 204 de l'API) ; « Envoi… » sur une photo en vol (elle ne se retire pas). */
function TileBadge({ label, testID }: { label: string; testID: string }) {
  const { t } = useTheme();
  return (
    <View style={[styles.removing, { backgroundColor: t.color.night }]} testID={testID}>
      <Text variant="caption" color={t.color.nightInk}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  removing: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    paddingVertical: 4,
    opacity: 0.85,
  },
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
