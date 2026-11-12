// La feuille « Comment le Fil choisit » (lot R8c2, maquette R8.3 `reglesH`) : pour chaque onglet son nom, sa phrase et ses
// puces, puis « Ta publication » et ses lignes, puis la note finale. Les mots sont ceux de `@orasso/shared` (le site lit les
// mêmes). « Pourquoi je vois ça » (par carte, `WhyThisSheet`) ne change pas.
import { Button, Icon, Tag, Text, tokens, useTheme } from "@orasso/design-system/native";
import { feedHowMine, feedHowNote, feedHowRules, feedScreenLabels as L } from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

import { AppSheet } from "@/ui/AppSheet";

const { space2, space3 } = tokens.spacing;

function Rule({
  name,
  phrase,
  bullets,
  tone,
  testID,
}: {
  name: string;
  phrase: string;
  bullets: readonly string[];
  tone: "line" | "acc";
  testID: string;
}) {
  const { t } = useTheme();
  return (
    <View style={[styles.rule, { backgroundColor: t.color.surface }]} testID={testID}>
      <View style={styles.tag}>
        <Tag tone={tone}>{name}</Tag>
      </View>
      <Text variant="bodyStrong" color={t.color.ink} style={styles.phrase}>
        {phrase}
      </Text>
      {bullets.map((b) => (
        <View key={b} style={styles.bullet}>
          <Text variant="caption" color={t.color.accentText} style={styles.dot}>
            {"•"}
          </Text>
          <Text variant="caption" color={t.color.inkMuted} style={styles.bulletText}>
            {b}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function HowFeedSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTheme();
  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel={L.howTitle} maxHeight={0.88}>
      <View style={styles.head}>
        <Text variant="posterM" color={t.color.ink} style={styles.title} accessibilityRole="header">
          {L.howTitle}
        </Text>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Fermer"
          hitSlop={6}
          style={[styles.closex, { backgroundColor: t.color.surface }]}
          testID="fil-how-close"
        >
          <Icon name="close" size={20} color={t.color.ink} />
        </Pressable>
      </View>
      {feedHowRules.map((r) => (
        <Rule
          key={r.filter}
          name={r.name}
          phrase={r.phrase}
          bullets={r.bullets}
          tone="line"
          testID={`fil-how-${r.filter}`}
        />
      ))}
      <Rule
        name={feedHowMine.name}
        phrase={feedHowMine.phrase}
        bullets={feedHowMine.bullets}
        tone="acc"
        testID="fil-how-mine"
      />
      <View style={styles.note}>
        <Icon name="info" size={16} color={t.color.accentText} />
        <Text variant="caption" color={t.color.inkMuted} style={styles.noteText} testID="fil-how-note">
          {feedHowNote.before}
          <Text variant="caption" color={t.color.ink} style={styles.strong}>
            {feedHowNote.strong}
          </Text>
          {feedHowNote.after}
        </Text>
      </View>
      <Button variant="secondary" icon="check" fullWidth onPress={onClose} testID="fil-how-ok">
        {L.howClose}
      </Button>
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "flex-start", gap: space2 },
  title: { flex: 1, fontSize: 20, lineHeight: 22 },
  closex: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  rule: { gap: 6, padding: 12, borderRadius: 14 },
  tag: { alignSelf: "flex-start" },
  phrase: { fontSize: 14, lineHeight: 19 },
  bullet: { flexDirection: "row", alignItems: "flex-start", gap: space2, paddingLeft: 4 },
  dot: { fontSize: 13, lineHeight: 18 },
  bulletText: { flex: 1, fontSize: 13, lineHeight: 18 },
  note: { flexDirection: "row", alignItems: "flex-start", gap: space2, marginBottom: space3 - space2 },
  noteText: { flex: 1, fontSize: 12.5, lineHeight: 18 },
  strong: { fontFamily: "Archivo-ExtraBold", fontSize: 12.5, lineHeight: 18 },
});
