// La légende d'une publication posée dans une liste « Une par une » : repliée après trois lignes, « plus » la déroule, « moins »
// la replie (règle `captionFold`). Hors d'une liste qui la demande (`FoldCaptions`), la légende reste entière : la carte du Fil
// ne change pas. La mesure est faite une fois, sur le texte entier, pour savoir s'il dépasse trois lignes.
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import { CAPTION_FOLD_LINES, captionFold, publicationsLabels as L } from "@orasso/shared";
import { createContext, type ReactNode, useContext, useState } from "react";
import { Pressable, StyleSheet, type TextStyle } from "react-native";

const FoldContext = createContext(false);

/** Les cartes posées dessous replient leur légende. */
export function FoldCaptions({ children }: { children: ReactNode }) {
  return <FoldContext.Provider value={true}>{children}</FoldContext.Provider>;
}

export function FoldedCaption({ text, style, testID }: { text: string; style?: TextStyle; testID?: string }) {
  const { t } = useTheme();
  const fold = useContext(FoldContext);
  const [lines, setLines] = useState(0);
  const [expanded, setExpanded] = useState(false);
  if (!fold) {
    return (
      <Text variant="body" color={t.color.ink} style={style} testID={testID}>
        {text}
      </Text>
    );
  }
  const state = captionFold({ lines, expanded });
  return (
    <>
      <Text
        variant="body"
        color={t.color.ink}
        style={style}
        // Avant la mesure : le texte entier (sinon on ne sait pas s'il dépasse) ; ensuite repliée ou non.
        numberOfLines={lines > 0 && state.clamp ? CAPTION_FOLD_LINES : undefined}
        onTextLayout={lines === 0 ? (e) => setLines(e.nativeEvent.lines.length) : undefined}
        testID={testID}
      >
        {text}
      </Text>
      {state.toggle ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setExpanded((on) => !on)}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.toggle}
          testID="publication-caption-toggle"
        >
          <Text variant="bodyStrong" color={t.color.accentText} style={styles.toggleText}>
            {state.toggle === "more" ? L.captionMore : L.captionLess}
          </Text>
        </Pressable>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  toggle: { alignSelf: "flex-start", minHeight: 24, justifyContent: "center", marginTop: -tokens.spacing.space1 },
  toggleText: { fontSize: 13.5 },
});
