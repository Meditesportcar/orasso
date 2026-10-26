// Lot R5b (maquette R5.4, remarque 6 de Damien) : la feuille « Ta photo de profil », ouverte en touchant sa photo dans
// l'onglet Profil ou dans « Modifier mon profil » : prendre une photo (carrée, recadrée à l'étape suivante), choisir dans
// la galerie, retirer la photo (l'initiale la remplace). Les mêmes lignes que les réglages (`.setlist` de la maquette).
import { Icon, type IconName, Text, tokens, useTheme } from "@orasso/design-system/native";
import { profilePhotoLabels as L } from "@orasso/shared";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { avatarForm, type PickedAvatar, pickAvatar, takeAvatar } from "@/lib/avatar";
import { errorMessage } from "@/lib/http";
import { useSession } from "@/lib/session";
import { AppSheet } from "@/ui/AppSheet";
import { Notice } from "@/ui/Notice";

const { space2, space3 } = tokens.spacing;

/** Refus de l'appareil photo : la ligne dit quoi faire. */
const CAMERA_DENIED =
  "L'appareil photo est refusé à Orasso : autorise-le dans les réglages du téléphone, ou choisis une photo dans la galerie.";

export function PhotoSheet({
  visible,
  onClose,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  /** Après un envoi ou un retrait réussi (« Photo enregistrée. »). */
  onDone?: (message: string) => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const { me, refreshMe } = useSession();
  const hasPhoto = Boolean(me?.profile.avatarUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    try {
      const done = await fn();
      if (done) {
        await refreshMe();
        onClose();
        onDone?.(done);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const upload = async (picked: PickedAvatar | null) => {
    if (!picked) return null;
    await api.uploadAvatar(await avatarForm(picked));
    return L.saved;
  };

  const rows: { key: string; icon: IconName; title: string; caption?: string; out?: boolean; go: () => void }[] = [
    {
      key: "take",
      icon: "camera",
      title: L.take,
      caption: L.takeCaption,
      go: () =>
        void run(async () => {
          const taken = await takeAvatar();
          if (taken === "denied") {
            setError(CAMERA_DENIED);
            return null;
          }
          return upload(taken);
        }),
    },
    { key: "pick", icon: "gallery", title: L.pick, go: () => void run(async () => upload(await pickAvatar())) },
  ];
  if (hasPhoto) {
    rows.push({
      key: "remove",
      icon: "trash",
      title: L.remove,
      caption: L.removeCaption,
      out: true,
      go: () =>
        void run(async () => {
          await api.removeAvatar();
          return L.removed;
        }),
    });
  }

  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel={L.sheetTitle}>
      <Text variant="posterM" color={c.ink} accessibilityRole="header" style={styles.title}>
        {L.sheetTitle}
      </Text>
      <View style={[styles.list, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]} testID="photo-sheet">
        {rows.map((r, i) => (
          <Pressable
            key={r.key}
            accessibilityRole="button"
            accessibilityLabel={r.caption ? `${r.title}, ${r.caption}` : r.title}
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={r.go}
            testID={`photo-${r.key}`}
            style={({ pressed }) => [
              styles.row,
              i > 0 && { borderTopWidth: 1, borderTopColor: c.line },
              (pressed || busy) && styles.pressed,
            ]}
          >
            <Icon name={r.icon} size={20} color={r.out ? c.winText : c.inkMuted} />
            <View style={styles.text}>
              <Text variant="bodyStrong" color={r.out ? c.winText : c.ink} style={styles.rowTitle}>
                {r.title}
              </Text>
              {r.caption ? (
                <Text variant="caption" color={c.inkMuted} style={styles.rowCaption}>
                  {r.caption}
                </Text>
              ) : null}
            </View>
            {r.out ? null : <Icon name="next" size={16} color={c.inkMuted} />}
          </Pressable>
        ))}
      </View>
      {error ? <Notice tone="error">{error}</Notice> : null}
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 18, lineHeight: 20 },
  list: { borderRadius: 18, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: space3, paddingVertical: 13, paddingHorizontal: 14 },
  text: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 14.5, lineHeight: 19, fontWeight: "800" },
  rowCaption: { fontSize: 12, lineHeight: 16 },
  pressed: { opacity: 0.7 },
  gap: { gap: space2 },
});
