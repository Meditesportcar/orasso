// La légende d'une publication posée dans une liste « Une par une » : repliée après trois lignes, « plus » la déroule, « moins »
// la replie (règle `captionFold`). Hors d'une liste qui la demande (`FoldCaptions`), la légende reste entière : la carte du Fil
// ne change pas. Le nombre de lignes du texte entier est mesuré par une copie invisible (hauteur lue ÷ interligne) : `onTextLayout`
// n'existe pas sur le web, et la recette de l'appli y tourne.
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
  const [fullHeight, setFullHeight] = useState(0);
  const [expanded, setExpanded] = useState(false);
  if (!fold) {
    return (
      <Text variant="body" color={t.color.ink} style={style} testID={testID}>
        {text}
      </Text>
    );
  }
  const lineHeight = style?.lineHeight ?? 20;
  const lines = fullHeight > 0 ? Math.round(fullHeight / lineHeight) : 0;
  const state = captionFold({ lines, expanded });
  return (
    <>
      <Text
        variant="body"
        color={t.color.ink}
        style={style}
        numberOfLines={state.clamp ? CAPTION_FOLD_LINES : undefined}
        testID={testID}
      >
        {text}
      </Text>
      {/* La copie invisible : le texte entier, pour savoir s'il dépasse trois lignes ; absente de l'accessibilité. */}
      <Text
        variant="body"
        color={t.color.ink}
        style={[style, styles.probe]}
        onLayout={(e) => setFullHeight(e.nativeEvent.layout.height)}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
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
  probe: { position: "absolute", left: 0, right: 0, opacity: 0 },
  toggle: { alignSelf: "flex-start", minHeight: 24, justifyContent: "center", marginTop: -tokens.spacing.space1 },
  toggleText: { fontSize: 13.5 },
});
