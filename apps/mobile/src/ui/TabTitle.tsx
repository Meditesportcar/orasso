// Grand titre d'un écran d'onglet (lot 40). Sur le téléphone : le `BigTitle` du système de design (une ligne, taille
// ajustée jusqu'à 70 %, étiquette à droite). Dans la version web de recette, react-native-web n'ajuste pas la taille
// (`adjustsFontSizeToFit`) et coupait les titres longs par des points de suspension : on mesure le texte et on réduit
// la taille jusqu'à 70 %, comme sur le téléphone, et l'étiquette passe dessous.
import { BigTitle, bigTitleSize, Text, useTheme } from "@orasso/design-system/native";
import { useLayoutEffect, useRef, useState } from "react";
import { Platform, StyleSheet, useWindowDimensions, View } from "react-native";

import { Muted } from "./Muted";

const MIN_SCALE = 0.7;

function WebTitle({ title, label }: { title: string; label?: string }) {
  const { t } = useTheme();
  const { width } = useWindowDimensions();
  const [scale, setScale] = useState(1);
  const ref = useRef<View>(null);
  const size = Math.round(bigTitleSize(width) * scale);

  // biome-ignore lint/correctness/useExhaustiveDependencies: on remesure quand le titre ou la largeur changent.
  useLayoutEffect(() => {
    setScale(1);
  }, [title, width]);

  useLayoutEffect(() => {
    // Sur le web, la vue est un élément du DOM et le texte son premier enfant.
    const node = (ref.current as unknown as HTMLElement | null)?.firstElementChild as HTMLElement | null | undefined;
    if (!node || typeof node.scrollWidth !== "number") return;
    if (node.scrollWidth > node.clientWidth + 1 && scale > MIN_SCALE) {
      setScale((s) => Math.max(MIN_SCALE, (s * node.clientWidth) / node.scrollWidth));
    }
  });

  return (
    <View style={styles.web} ref={ref}>
      <Text
        variant="posterL"
        color={t.color.ink}
        accessibilityRole="header"
        numberOfLines={1}
        style={{ fontSize: size, lineHeight: size }}
      >
        {title}
      </Text>
      {label ? <Muted variant="label">{label}</Muted> : null}
    </View>
  );
}

export function TabTitle({ title, label }: { title: string; label?: string }) {
  if (Platform.OS === "web") return <WebTitle title={title} label={label} />;
  return <BigTitle title={title} label={label} />;
}

const styles = StyleSheet.create({ web: { paddingTop: 6, gap: 4 } });
