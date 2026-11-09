// Le menu « ⋯ » d'une story (maquette R7.7, feuille `sm`) : pour la story d'un autre, « Ne plus voir ses stories » (mise en
// sourdine personnelle, sans prévenir l'auteur : il reste suivi), « Signaler » (la feuille de signalement de l'appli, cible
// `story`) et, si je suis identifié dedans, « Me retirer de cette story » ; pour ma story, « Vues · 12 » (la liste, pour moi
// seul) et « Supprimer ». Pendant qu'elle est ouverte, la story est en pause (`open` coupe la minuterie).
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { storyViewerLabels as L, shareLabels } from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

import { SetRow } from "@/features/profil/parts";
import { AppSheet } from "@/ui/AppSheet";

export function MenuSheet({
  open,
  mine,
  views,
  tagged,
  onClose,
  onMute,
  onReport,
  onRemoveTag,
  onViews,
  onDelete,
  onExternal,
}: {
  open: boolean;
  mine: boolean;
  views: number;
  /** Je suis identifié dans cette story (personne) : je peux m'en retirer. */
  tagged: boolean;
  onClose: () => void;
  onMute: () => void;
  onReport: () => void;
  onRemoveTag: () => void;
  onViews: () => void;
  onDelete: () => void;
  /** Ma story (hors crew) : l'envoyer vers l'extérieur (R7f4). Absent : pas de ligne. */
  onExternal?: () => void;
}) {
  const { t } = useTheme();
  return (
    <AppSheet visible={open} onClose={onClose} accessibilityLabel={L.menuTitle}>
      <View style={styles.head}>
        <Text variant="posterM" color={t.color.ink} style={styles.title} accessibilityRole="header">
          {L.menuTitle}
        </Text>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={L.close}
          hitSlop={6}
          style={[styles.closex, { backgroundColor: t.color.surface }]}
          testID="story-menu-close"
        >
          <Icon name="close" size={20} color={t.color.ink} />
        </Pressable>
      </View>
      <View style={[styles.list, { backgroundColor: t.color.surface, boxShadow: t.shadow.shadowCard }]}>
        {mine ? (
          <>
            <SetRow first icon="eye" title={L.views(views)} onPress={onViews} testID="story-menu-views" />
            {onExternal ? (
              <SetRow
                icon="export"
                title={shareLabels.menuExternal}
                onPress={onExternal}
                testID="story-menu-external"
              />
            ) : null}
            <SetRow
              icon="trash"
              title={L.delete}
              caption={L.deleteHint}
              onPress={onDelete}
              tone="out"
              testID="story-menu-delete"
            />
          </>
        ) : (
          <>
            <SetRow first icon="eyeOff" title={L.mute} caption={L.muteHint} onPress={onMute} testID="story-menu-mute" />
            {tagged ? (
              <SetRow icon="profile" title={L.removeTag} onPress={onRemoveTag} testID="story-menu-untag" />
            ) : null}
            <SetRow
              icon="flag"
              title={L.report}
              caption={L.reportHint}
              onPress={onReport}
              tone="out"
              testID="story-menu-report"
            />
          </>
        )}
      </View>
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "flex-start", gap: tokens.spacing.space2 },
  title: { flex: 1, fontSize: 20, lineHeight: 22 },
  closex: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  list: { borderRadius: tokens.radius.radiusLg, overflow: "hidden" },
});
