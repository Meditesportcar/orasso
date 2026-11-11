// La deuxième ligne d'une carte de publication rattachée à un événement (lot R8c2, maquette R8.7 `r8at`) : « pour le
// Rassemblement du Lydia · lun. 9 nov. », « présent au … », « sera au … », « était au … », avec le tampon « Présent » quand
// la présence est validée. Le verbe est accordé avec le titre (`attachPhrase`). Toute la ligne ouvre la fiche de l'événement ;
// le titre ne se tronque jamais. Sans rôle (passionné après la fin, présence non validée) : le titre seul.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { attachDateLabel, attachPhrase, type FeedAttachView, feedScreenLabels as L } from "@orasso/shared";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { SmButton } from "@/ui/Kit";

/** Le texte de la ligne : « pour le Rassemblement du Lydia · lun. 9 nov. ». */
export function attachLineText(attach: FeedAttachView): string {
  const phrase = attachPhrase(attach.role, attach.phase, attach.event.title);
  const date = attachDateLabel(attach.event.startsAt);
  return date ? `${phrase} · ${date}` : phrase;
}

export function AttachLine({ attach }: { attach: FeedAttachView }) {
  const { t } = useTheme();
  const router = useRouter();
  const text = attachLineText(attach);
  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={L.attachOpen(text)}
        onPress={() => router.push(`/e/${attach.event.slug}`)}
        style={styles.line}
        testID="feed-attach"
      >
        <Text variant="caption" color={t.color.accentText} style={styles.text} testID="feed-attach-text">
          {text}
        </Text>
        <Icon name="next" size={14} color={t.color.accentText} />
      </Pressable>
      {attach.presenceValidated ? (
        <View style={[styles.stamp, { borderColor: t.color.accentText }]} testID="feed-attach-stamp">
          <Icon name="stamp" size={13} color={t.color.accentText} />
          <Text variant="caption" color={t.color.accentText} style={styles.stampText}>
            {L.attachStamp}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/** « Voir la fiche » : le bouton secondaire de la ligne d'actions d'une publication d'organisateur. */
export function AttachSeeButton({ attach }: { attach: FeedAttachView }) {
  const router = useRouter();
  if (attach.role !== "organizer") return null;
  return (
    <SmButton
      kind="s"
      icon="next"
      onPress={() => router.push(`/e/${attach.event.slug}`)}
      testID="feed-attach-see"
      accessibilityLabel={`${L.seeEvent} : ${attach.event.title}`}
    >
      {L.seeEvent}
    </SmButton>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: tokens.spacing.space2 },
  // 44 px de haut pour le doigt, le texte reste sur ses lignes (jamais tronqué).
  line: { flexShrink: 1, flexDirection: "row", alignItems: "center", gap: 3, minHeight: 44 },
  text: { flexShrink: 1, fontFamily: "Archivo-ExtraBold", fontSize: 12.5, lineHeight: 16 },
  stamp: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 24,
    paddingHorizontal: 8,
    borderRadius: tokens.radius.radiusPill,
    borderWidth: 1.5,
  },
  stampText: { fontFamily: "Archivo-ExtraBold", fontSize: 11 },
});
