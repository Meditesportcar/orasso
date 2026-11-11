// Le texte d'un commentaire : les pseudos que l'API a reconnus (`mentions`) sont en couleur, jamais un « @mot » qu'elle n'a pas vu.
import { Text, useTheme } from "@orasso/design-system/native";
import { mentionParts } from "@orasso/shared";
import type { TextStyle } from "react-native";

export function MentionText({
  text,
  mentions,
  style,
  size = 13.5,
  lineHeight = 19,
}: {
  text: string;
  mentions: readonly string[];
  style?: TextStyle;
  size?: number;
  lineHeight?: number;
}) {
  const { t } = useTheme();
  return (
    <Text variant="body" color={t.color.ink} style={[{ fontSize: size, lineHeight }, style]}>
      {mentionParts(text, mentions).map((part, i) =>
        part.mention ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: morceaux d'un texte, sans identité.
          <Text key={i} variant="bodyStrong" color={t.color.accentText} style={{ fontSize: size, lineHeight }}>
            {part.text}
          </Text>
        ) : (
          part.text
        ),
      )}
    </Text>
  );
}
