// Un texte du système : les styles de texte des jetons (voir textStyles.ts).

import type { ReactNode } from "react";
import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import type { TypeStyleName } from "../tokens";
import { textStyles } from "./textStyles";

export { textStyle, textStyles } from "./textStyles";

export type TextProps = RNTextProps & {
  variant: TypeStyleName;
  color?: string;
  children?: ReactNode;
};

/** Un texte du système. Un nom de véhicule ne se tronque jamais : pas de `numberOfLines` par défaut. */
export function Text({ variant, color, style, ...rest }: TextProps) {
  return <RNText style={[textStyles[variant], color ? { color } : null, style]} {...rest} />;
}
