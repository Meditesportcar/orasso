// La feuille « … » d'une ligne de « Tes photos » (lot R9f, maquette R9.7 `phsheetH`) : l'intro (qui a posé l'identification), puis
// « Retirer mon identification » (je l'ai posée moi-même) ou « Ce n'est pas ma voiture » (un autre l'a posée : le média ou l'organisateur
// en est prévenu), « Contacter <média> » et « Signaler ». C'est le même geste côté API (`DELETE /me/album-tags/:id`) : le motif vient
// de qui avait posé l'identification.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { albumTagLabels as L, type MyPhoto } from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

import { AppSheet } from "@/ui/AppSheet";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";

const { space2, space3 } = tokens.spacing;

export function PhotoSheet({
  photo,
  mediaName,
  busy,
  error,
  onClose,
  onRemove,
  onContact,
  onReport,
}: {
  /** La photo dont la feuille est ouverte ; `null` : fermée. */
  photo: MyPhoto | null;
  mediaName: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onRemove: (photo: MyPhoto) => void;
  onContact: () => void;
  onReport: (photo: MyPhoto) => void;
}) {
  const self = photo?.taggedBy === "me";
  const by = photo?.taggedBy === "organizer" ? L.screens.organizerName : mediaName;
  return (
    <AppSheet visible={photo !== null} onClose={onClose} accessibilityLabel={L.myPhotos}>
      {photo ? (
        <>
          <Muted variant="caption" testID="photo-sheet-intro">
            {self ? L.screens.sheetIntroSelf : L.screens.sheetIntroBy(by)}
          </Muted>
          {error ? (
            <Notice tone="error" testID="photo-sheet-error">
              {error}
            </Notice>
          ) : null}
          <Row
            icon="close"
            title={self ? L.withdrawMine : L.notMyCar}
            sub={self ? L.photoStaysWith(mediaName) : L.isNotifiedDeclined(by)}
            disabled={busy}
            onPress={() => onRemove(photo)}
            testID={self ? "photo-sheet-withdraw" : "photo-sheet-not-mine"}
          />
          <Row
            icon="chat"
            title={L.contactName(mediaName)}
            sub={L.messageAboutPhoto}
            disabled={busy}
            onPress={onContact}
            testID="photo-sheet-contact"
          />
          <Row
            icon="flag"
            title={L.report}
            sub={L.awkwardOrPlate}
            disabled={busy}
            onPress={() => onReport(photo)}
            testID="photo-sheet-report"
          />
        </>
      ) : null}
    </AppSheet>
  );
}

function Row({
  icon,
  title,
  sub,
  disabled,
  onPress,
  testID,
}: {
  icon: "close" | "chat" | "flag";
  title: string;
  sub: string;
  disabled: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}`}
      disabled={disabled}
      onPress={onPress}
      style={[styles.row, { backgroundColor: c.surface, borderColor: c.line }, disabled ? styles.dim : null]}
      testID={testID}
    >
      <Icon name={icon} size={20} color={c.ink} />
      <View style={styles.grow}>
        <Text variant="bodyStrong" color={c.ink}>
          {title}
        </Text>
        <Text variant="caption" color={c.inkMuted}>
          {sub}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  dim: { opacity: 0.6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    padding: space3,
    borderWidth: 1,
    borderRadius: tokens.radius.radiusMd,
    minHeight: tokens.spacing.touch,
    marginBottom: space2,
  },
});
