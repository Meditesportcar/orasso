// Étape 1 de l'ajout de véhicule : ses photos, au carré (lot M1, maquette 1.1, retours 04, 08 et 10). Sans photo, une
// grande case d'appel (appareil photo ou galerie) ; ensuite la grille de vignettes carrées avec l'étoile (couverture),
// recadrer et supprimer, et la case « Ajouter · Appareil ou galerie · 2 sur 8 ». La ligne « 3 photos conseillées » se
// remplit : il en faut 3 pour demander la certification (décision de Damien du 22/10).
import { Button, Icon, Photo, Tag, Text, tokens, useTheme, withAlpha } from "@orasso/design-system/native";
import { CERTIFICATION_MIN_PHOTOS, photoLabels, vehicleAddLabels as V } from "@orasso/shared";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { ConfirmSheet } from "@/features/orga/ConfirmSheet";
import { mediaSource } from "@/lib/media";
import { AppSheet } from "@/ui/AppSheet";
import { Overlay } from "@/ui/Overlay";
import { type Draft, MAX_PHOTOS } from "./model";
import { StepHead, StepNote } from "./parts";

const { space1, space2, space3, space4 } = tokens.spacing;

export type PhotoSource = "camera" | "gallery";

export function StepPhotos({
  draft,
  onAdd,
  onRemove,
  onCover,
  onCrop,
  busy,
}: {
  draft: Draft;
  onAdd: (from: PhotoSource) => void;
  onRemove: (index: number) => void;
  onCover: (index: number) => void;
  onCrop: (index: number) => void;
  busy: boolean;
}) {
  const { t, theme } = useTheme();
  const c = t.color;
  const soft = withAlpha(c.accent, theme === "sable" ? 0.26 : 0.16);
  const [removing, setRemoving] = useState<number | null>(null);
  const [choosing, setChoosing] = useState(false);
  const n = draft.photos.length;
  const pick = (from: PhotoSource) => {
    setChoosing(false);
    onAdd(from);
  };
  return (
    <>
      <StepHead title={V.photosTitle} text={V.photosText} />
      {n === 0 ? (
        <View style={[styles.call, { backgroundColor: soft, borderColor: c.accent }]} testID="vehicle-photo-call">
          <View style={[styles.callIcon, { backgroundColor: c.accent }]}>
            <Icon name="camera" size={30} color={c.accentInk} />
          </View>
          <Text variant="posterM" color={c.ink} style={styles.center}>
            {V.callTitle}
          </Text>
          <Text variant="caption" color={c.inkMuted} style={styles.center}>
            {V.callText}
          </Text>
          <View style={styles.callRow}>
            <Button
              variant="poster"
              icon="camera"
              disabled={busy}
              onPress={() => pick("camera")}
              testID="vehicle-photo-camera"
            >
              {V.camera}
            </Button>
            <Button
              variant="secondary"
              icon="gallery"
              disabled={busy}
              onPress={() => pick("gallery")}
              testID="vehicle-photo-add"
            >
              {V.gallery}
            </Button>
          </View>
        </View>
      ) : null}
      <CertLine count={n} />
      {n > 0 ? (
        <View style={styles.grid} testID="new-vehicle-photos">
          {draft.photos.map((p, i) => (
            <View key={p.key} style={styles.cell}>
              <View style={[styles.tile, { backgroundColor: c.surfaceSunken, boxShadow: t.shadow.shadowCard }]}>
                <Photo source={p.remoteId ? mediaSource(p.uri) : { uri: p.uri }} style={StyleSheet.absoluteFill} />
                <View style={styles.tags}>
                  {i === 0 ? <Tag tone="acc">{V.cover}</Tag> : null}
                  {p.plateBlurred ? (
                    <Tag tone="line" on="poster">
                      {V.photoMasked}
                    </Tag>
                  ) : null}
                </View>
                <View style={styles.acts}>
                  <TileButton
                    icon="star"
                    label={i === 0 ? V.isCover : V.makeCover}
                    on={i === 0}
                    disabled={busy}
                    onPress={() => onCover(i)}
                    testID="photo-cover"
                  />
                  {p.source ? (
                    <TileButton
                      icon="crop"
                      label={V.crop}
                      disabled={busy}
                      onPress={() => onCrop(i)}
                      testID="photo-crop"
                    />
                  ) : null}
                  <TileButton
                    icon="trash"
                    label={V.remove}
                    disabled={busy}
                    onPress={() => setRemoving(i)}
                    testID="photo-remove"
                  />
                </View>
              </View>
            </View>
          ))}
          {n < MAX_PHOTOS ? (
            <View style={styles.cell}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${V.add}, ${V.addHint}, ${V.count(n)}`}
                disabled={busy}
                onPress={() => setChoosing(true)}
                testID="vehicle-photo-more"
                style={[styles.tile, styles.add, { backgroundColor: soft, borderColor: c.accent }]}
              >
                <View style={[styles.addIcon, { backgroundColor: c.accent }]}>
                  <Icon name="camera" size={22} color={c.accentInk} />
                </View>
                <Text variant="bodyStrong" color={c.ink}>
                  {V.add}
                </Text>
                <Text variant="caption" color={c.inkMuted} style={styles.small}>
                  {V.addHint}
                </Text>
                <Text variant="caption" color={c.inkMuted} style={styles.small}>
                  {V.count(n)}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}
      <StepNote icon="spark">{V.plateNote}</StepNote>
      <ConfirmSheet
        modal
        visible={removing !== null}
        title={photoLabels.removeTitle}
        body={photoLabels.removeBody}
        confirmLabel={photoLabels.removeConfirm}
        confirmIcon="trash"
        danger
        onConfirm={() => {
          if (removing !== null) onRemove(removing);
          setRemoving(null);
        }}
        onClose={() => setRemoving(null)}
      />
      {/* Zone des feuilles de l'écran : sinon le pied du parcours passe par-dessus la feuille (lot M2). */}
      <Overlay>
        <AppSheet visible={choosing} onClose={() => setChoosing(false)} accessibilityLabel={V.callTitle}>
          <Text variant="title" color={c.ink}>
            {V.callTitle}
          </Text>
          <Button
            variant="secondary"
            icon="camera"
            fullWidth
            onPress={() => pick("camera")}
            testID="vehicle-sheet-camera"
          >
            {V.camera}
          </Button>
          <Button
            variant="secondary"
            icon="gallery"
            fullWidth
            onPress={() => pick("gallery")}
            testID="vehicle-sheet-gallery"
          >
            {V.gallery}
          </Button>
          <Button variant="plate" icon="close" fullWidth onPress={() => setChoosing(false)}>
            {V.cropCancel}
          </Button>
        </AppSheet>
      </Overlay>
    </>
  );
}

/** « 3 photos conseillées · il en faut 3 pour demander la certification », avec trois pastilles qui se remplissent. */
function CertLine({ count }: { count: number }) {
  const { t } = useTheme();
  const c = t.color;
  const full = count >= CERTIFICATION_MIN_PHOTOS;
  return (
    <View
      style={[styles.cert, { backgroundColor: c.surface, borderColor: c.cardLine }]}
      accessible
      testID="vehicle-photo-cert"
    >
      <View style={styles.dots}>
        {Array.from({ length: CERTIFICATION_MIN_PHOTOS }, (_, i) => (
          <View
            // biome-ignore lint/suspicious/noArrayIndexKey: trois pastilles fixes
            key={i}
            style={[
              styles.dot,
              i < count ? { backgroundColor: c.accent } : { borderWidth: 2, borderColor: c.inkFaint },
            ]}
          />
        ))}
      </View>
      <View style={styles.grow}>
        <Text variant="bodyStrong" color={c.ink} style={styles.small}>
          {full ? V.certReady : V.certTitle}
        </Text>
        <Text variant="caption" color={c.inkMuted} style={styles.small}>
          {full ? V.certRest : count > 0 ? V.certSome(count) : V.certNone}
        </Text>
      </View>
    </View>
  );
}

/** Bouton rond posé sur une vignette (`.ph-t .acts`) : étoile allumée en moutarde pour la couverture. */
function TileButton({
  icon,
  label,
  on = false,
  disabled,
  onPress,
  testID,
}: {
  icon: "star" | "crop" | "trash";
  label: string;
  on?: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on, disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      hitSlop={4}
      style={[styles.act, { backgroundColor: on ? c.accent : withAlpha(c.night, 0.7) }]}
    >
      <Icon name={icon} size={18} color={on ? c.accentInk : c.nightInk} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1, minWidth: 0 },
  center: { textAlign: "center" },
  small: { fontSize: tokens.type.meta.fontSize, lineHeight: tokens.type.meta.lineHeight },
  call: {
    alignItems: "center",
    gap: space2,
    paddingVertical: 26,
    paddingHorizontal: space4,
    borderRadius: tokens.radius.radiusLg,
    borderWidth: 2,
    borderStyle: "dashed",
  },
  callIcon: {
    width: 64,
    height: 64,
    borderRadius: tokens.radius.radiusPill,
    alignItems: "center",
    justifyContent: "center",
  },
  callRow: { flexDirection: "row", gap: space2, marginTop: space1 + 2, flexWrap: "wrap", justifyContent: "center" },
  cert: {
    flexDirection: "row",
    alignItems: "center",
    gap: space2 + 2,
    paddingVertical: space2 + 2,
    paddingHorizontal: space3,
    borderRadius: tokens.radius.radiusMd,
    borderWidth: 1,
  },
  dots: { flexDirection: "row", gap: space1 },
  dot: { width: 12, height: 12, borderRadius: tokens.radius.radiusPill },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5, rowGap: 10 },
  cell: { width: "50%", paddingHorizontal: 5 },
  tile: { width: "100%", aspectRatio: 1, borderRadius: tokens.radius.radiusLg, overflow: "hidden" },
  tags: { position: "absolute", left: space2, top: space2, gap: space1, alignItems: "flex-start" },
  acts: { position: "absolute", right: space2, bottom: space2, flexDirection: "row", gap: space1 + 2 },
  act: {
    width: 36,
    height: 36,
    borderRadius: tokens.radius.radiusChip,
    alignItems: "center",
    justifyContent: "center",
  },
  add: {
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    padding: space2,
  },
  addIcon: {
    width: 46,
    height: 46,
    borderRadius: tokens.radius.radiusPill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space1,
  },
});
