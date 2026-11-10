// Le bas de la visionneuse (maquette R7.7 `.r7svbot`) : pour la story de quelqu'un d'autre, le champ « Répondre à Lea_11 »
// (un message privé : `POST /stories/:id/reply`) et la flamme (réaction, sans compteur : le nombre est pour l'auteur seul) ;
// pour ma story, « Vues · 12 » (la liste, pour moi seul) et le nombre de flammes. Le champ en saisie met la story en pause
// (`onFocusChange`). Une story de pro n'a pas de champ : aucune messagerie de pro n'existe (R7f1, `reply_unavailable`).
import { Icon, Text, tokens, useTheme, withAlpha } from "@orasso/design-system/native";
import { storyViewerLabels as L, type StoryView } from "@orasso/shared";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

const { space2, space3 } = tokens.spacing;

/** Chevron de part et d'autre du champ (maquette R8.10 `.r8aut2`) : auteur précédent / suivant ; rien s'il n'y en a pas. */
function AuthorButton({ dir, onPress }: { dir: "prev" | "next"; onPress?: () => void }) {
  const { t } = useTheme();
  if (!onPress) return null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={dir === "prev" ? L.authorPrev : L.authorNext}
      style={[styles.author, { borderColor: withAlpha(t.color.nightInk, 0.55) }]}
      testID={dir === "prev" ? "story-author-prev" : "story-author-next"}
    >
      <View style={dir === "next" ? styles.mirror : undefined}>
        <Icon name="back" size={20} color={t.color.nightInk} />
      </View>
    </Pressable>
  );
}

export function Bottom({
  story,
  mine,
  name,
  canReply,
  text,
  onText,
  sending,
  onSend,
  onFocusChange,
  onFlame,
  onViews,
  onPrevAuthor,
  onNextAuthor,
}: {
  story: StoryView;
  mine: boolean;
  name: string;
  canReply: boolean;
  text: string;
  onText: (v: string) => void;
  sending: boolean;
  onSend: () => void;
  onFocusChange: (focused: boolean) => void;
  onFlame: () => void;
  onViews: () => void;
  /** Lecture enchaînée (R8s) : absents s'il n'y a pas d'auteur avant ou après. */
  onPrevAuthor?: () => void;
  onNextAuthor?: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const border = withAlpha(c.nightInk, 0.55);
  const reacted = story.reacted;
  if (mine) {
    return (
      <View style={styles.row} pointerEvents="box-none">
        <AuthorButton dir="prev" onPress={onPrevAuthor} />
        <Pressable
          onPress={onViews}
          accessibilityRole="button"
          accessibilityLabel={L.views(story.viewsCount ?? 0)}
          style={[styles.pill, styles.grow, { borderColor: border }]}
          testID="story-views"
        >
          <Icon name="eye" size={18} color={c.nightInk} />
          <Text variant="bodyStrong" color={c.nightInk} style={styles.pillText}>
            {L.views(story.viewsCount ?? 0)}
          </Text>
        </Pressable>
        <AuthorButton dir="next" onPress={onNextAuthor} />
        <View
          style={[styles.pill, styles.flame, { borderColor: border }]}
          accessibilityLabel={L.flameCount(story.reactionsCount ?? 0)}
          testID="story-flames-count"
        >
          <Icon name="fire" size={20} color={c.nightInk} />
          <Text variant="bodyStrong" color={c.nightInk} style={styles.pillText}>
            {story.reactionsCount ?? 0}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.row} pointerEvents="box-none">
      <AuthorButton dir="prev" onPress={onPrevAuthor} />
      {canReply ? (
        <View style={[styles.pill, styles.grow, { borderColor: border }]}>
          <Icon name="bubble" size={18} color={c.nightInk} />
          <TextInput
            value={text}
            onChangeText={onText}
            onFocus={() => onFocusChange(true)}
            onBlur={() => onFocusChange(false)}
            onSubmitEditing={onSend}
            placeholder={L.replyTo(name)}
            placeholderTextColor={withAlpha(c.nightInk, 0.75)}
            selectionColor={c.accent}
            maxLength={500}
            returnKeyType="send"
            accessibilityLabel={L.replyTo(name)}
            style={[styles.input, { color: c.nightInk }]}
            testID="story-reply-input"
          />
          {text.trim() ? (
            <Pressable
              onPress={onSend}
              disabled={sending}
              accessibilityRole="button"
              accessibilityLabel={sending ? L.replySending : L.replySend}
              hitSlop={8}
              testID="story-reply-send"
            >
              <Icon name="send" size={20} color={c.accent} />
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.grow} pointerEvents="none" />
      )}
      <AuthorButton dir="next" onPress={onNextAuthor} />
      <Pressable
        onPress={onFlame}
        accessibilityRole="button"
        accessibilityState={{ selected: reacted }}
        accessibilityLabel={reacted ? L.flameOn : L.flame}
        style={[styles.pill, styles.flame, { borderColor: reacted ? c.accent : border }]}
        testID="story-flame"
      >
        <Icon name="fire" size={22} color={reacted ? c.accent : c.nightInk} filled={reacted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: space3 },
  grow: { flex: 1 },
  pill: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: space2,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  flame: { justifyContent: "center", minWidth: 48 },
  author: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  mirror: { transform: [{ scaleX: -1 }] },
  pillText: { fontSize: 14, lineHeight: 18 },
  input: { flex: 1, minWidth: 0, fontSize: 14.5, paddingVertical: 0, height: 44 },
});
