// Une ligne de « Pratique » (`.r8prow` de la maquette R8.12) : l'icône de la sorte, le titre (jamais coupé : il passe à la ligne), une
// ligne de détail, et « Y aller » (Maps ou Waze, comme sur la fiche d'un événement). Partagée par le bloc de l'Accueil et l'écran.
import { Icon, type IconName, Text, tokens, useTheme } from "@orasso/design-system/native";
import { practicalTexts as L, type PracticalKind } from "@orasso/shared";
import { useEffect, useState } from "react";
import { Platform, StyleSheet, View } from "react-native";

import { openMaps, openWaze } from "@/lib/directions";
import { AppSheet } from "@/ui/AppSheet";
import { SmButton } from "@/ui/Kit";

export const kindIcon: Record<PracticalKind, IconName> = { fuel: "fuel", wash: "drop" };

/** Une destination : un lieu (titre et coordonnées). */
export type GoTarget = { title: string; lat: number; lng: number };

/** Dans un navigateur, Échap ferme la feuille ouverte (sur le téléphone, c'est le retour du système). */
export function useEscape(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open || Platform.OS !== "web") return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open, close]);
}

/** « Y aller » : la feuille Maps / Waze d'un lieu. `go` l'ouvre, `sheet` est à poser une fois dans l'écran. */
export function useGoSheet() {
  const [target, setTarget] = useState<GoTarget | null>(null);
  useEscape(target !== null, () => setTarget(null));
  const sheet = (
    <AppSheet visible={target !== null} onClose={() => setTarget(null)} accessibilityLabel={L.goThere}>
      <Text variant="posterS" accessibilityRole="header" testID="go-title">
        {target ? `${L.goThere} : ${target.title}` : L.goThere}
      </Text>
      <SmButton
        kind="s"
        icon="nav"
        wide
        onPress={() => {
          if (target) openMaps(target);
          setTarget(null);
        }}
        testID="go-maps"
      >
        {L.goMaps}
      </SmButton>
      <SmButton
        kind="s"
        icon="nav"
        wide
        onPress={() => {
          if (target) openWaze(target);
          setTarget(null);
        }}
        testID="go-waze"
      >
        {L.goWaze}
      </SmButton>
    </AppSheet>
  );
  return { go: setTarget, sheet };
}

export function PracticalRow({
  kind,
  title,
  detail,
  onGo,
  primary = false,
  selected = false,
  testID,
  shadow = true,
}: {
  kind: PracticalKind;
  title: string;
  detail: string;
  onGo: () => void;
  /** Le bouton principal de l'écran (la carte d'un lieu touché dans la carte) : « Y aller » moutarde. */
  primary?: boolean;
  /** La ligne du lieu touché dans la carte : un liseré moutarde (`.r8prow.on`). */
  selected?: boolean;
  testID?: string;
  shadow?: boolean;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View
      style={[
        styles.row,
        { backgroundColor: c.surface },
        shadow && { boxShadow: t.shadow.shadowCard },
        selected && { borderWidth: 2, borderColor: c.accent },
      ]}
      testID={testID}
    >
      <View style={[styles.pic, { backgroundColor: c.surfaceRaised }]}>
        <Icon name={kindIcon[kind]} size={16} color={c.ink} />
      </View>
      <View style={styles.text}>
        <Text variant="bodyStrong" color={c.ink}>
          {title}
        </Text>
        <Text variant="caption" color={c.inkMuted}>
          {detail}
        </Text>
      </View>
      <SmButton
        kind={primary ? "p" : "s"}
        icon="nav"
        onPress={onGo}
        accessibilityLabel={L.goA11y(title)}
        testID={testID ? `${testID}-go` : undefined}
      >
        {L.goThere}
      </SmButton>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: tokens.radius.radiusMd,
  },
  pic: { width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  text: { flex: 1, minWidth: 0 },
});
