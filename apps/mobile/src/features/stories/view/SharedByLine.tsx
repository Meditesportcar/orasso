// « Story de Kenji_66, ajoutée par Roues Libres 66 » (maquette R7.7 `.r7cred`) : le crédit d'une copie, en pastille avec
// l'avatar de l'auteur d'origine et son nom en gras. C'est l'identité PUBLIQUE de l'originale (la personne, la structure ou
// le pro selon sa casquette) ; la toucher ouvre le profil, la page de la structure ou la fiche correspondante (lot R7h).
// La ligne reste lisible sans le geste (texte seul).
import { Photo, Text, tokens, useTheme, withAlpha } from "@orasso/design-system/native";
import { albumLabels, storyViewerLabels as L, type StoryTagView, type StoryView } from "@orasso/shared";
import { Pressable, StyleSheet, View } from "react-native";

import { mediaSource } from "@/lib/media";

const { space1, space2 } = tokens.spacing;

export function SharedByLine({
  story,
  authorName,
  onOpen,
}: {
  story: StoryView;
  authorName: string;
  onOpen?: (tag: StoryTagView) => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const credit = story.sharedFrom;
  // Lot R9f : une story reprise d'une photo d'album porte « Photos : <média> », le crédit du photographe, qui ne se retire pas.
  if (!credit) return story.credit ? <PhotoCredit name={story.credit.mediaName} /> : null;
  const name = credit.name;
  const full = L.sharedBy(name, authorName);
  const at = name ? full.indexOf(name) : -1;
  const link = Boolean(onOpen && credit.slug);
  const source = mediaSource(credit.avatarUrl);
  return (
    <Pressable
      onPress={link ? () => onOpen?.(credit) : undefined}
      disabled={!link}
      accessibilityRole={link ? "link" : "text"}
      accessibilityLabel={full}
      hitSlop={8}
      style={[styles.line, { backgroundColor: withAlpha(c.night, 0.6) }]}
      testID="story-shared-by"
    >
      <View style={[styles.face, { backgroundColor: c.win }]}>
        {source ? (
          <Photo source={source} style={styles.img} />
        ) : (
          <Text variant="posterL" color={c.winInk} style={styles.initial}>
            {name.charAt(0).toUpperCase()}
          </Text>
        )}
      </View>
      <Text variant="caption" color={c.nightInk} style={styles.text}>
        {at < 0 ? (
          full
        ) : (
          <>
            {full.slice(0, at)}
            <Text variant="caption" color={c.nightInk} style={styles.bold} testID="story-shared-by-author">
              {name}
            </Text>
            {full.slice(at + name.length)}
          </>
        )}
      </Text>
    </Pressable>
  );
}

/** « Photos : <média> » : le crédit d'une story reprise d'une photo d'album (lot R9f), en pastille comme celui d'une copie. */
function PhotoCredit({ name }: { name: string }) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View
      accessibilityLabel={albumLabels.creditLine(name)}
      style={[styles.line, { backgroundColor: withAlpha(c.night, 0.6) }]}
      testID="story-photo-credit"
    >
      <Text variant="caption" color={c.nightInk} style={styles.text}>
        {albumLabels.creditLine(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: space2,
    marginLeft: space1,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 10,
    borderRadius: 999,
    maxWidth: "100%",
  },
  face: { width: 24, height: 24, borderRadius: 12, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  img: { width: 24, height: 24 },
  initial: { fontSize: 9, lineHeight: 11 },
  text: { flexShrink: 1, fontSize: 12, lineHeight: 15 },
  bold: { fontFamily: "Archivo-ExtraBold" },
});
