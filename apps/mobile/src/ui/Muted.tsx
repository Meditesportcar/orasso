// Texte secondaire posé directement sur le fond. Le fond Sable est un sable moyen qui noircit dans les coins : le gris
// ink-muted n'y est pas lisible (tokens.json : « sur Sable, dans la zone sombre, utiliser plate-muted sur une
// plaque »). Là où on n'a pas de plaque, le texte secondaire prend donc l'encre pleine en Sable.
import { Text, type TextProps, useTheme } from "@orasso/design-system/native";

export function Muted({ style, ...props }: Omit<TextProps, "color">) {
  const { t, theme } = useTheme();
  return <Text color={theme === "sable" ? t.color.ink : t.color.inkMuted} style={style} {...props} />;
}
