// Section « v2 » de la recette native /_ds (lot 38) : les écarts de la surcouche de jetons avec leur raison, le contour
// sur photo et sur fond, la barre du haut v2, les grands titres sur une ligne et les six barres d'onglets.

import {
  AppBar,
  BigTitle,
  OutlinedText,
  TabBar,
  type TabSetName,
  Text,
  type ThemeTokens,
  tabSets,
  tokensV2Overlay,
} from "@orasso/design-system/native";
import { personaKindLabels } from "@orasso/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

/** Les neuf grands titres d'onglet du prototype, avec une étiquette de droite d'exemple. */
const BIG_TITLES: ReadonlyArray<readonly [string, string]> = [
  ["Mon garage", "3 véhicules"],
  ["Mes sorties", "2 à venir"],
  ["Explorer", "Pyrénées-Orientales"],
  ["Mon profil", "Grade Pilote"],
  ["Missions", "4 près de toi"],
  ["Candidatures", "1 en attente"],
  ["Accréditations", "2 demandes"],
  ["Contenus", "12 publiés"],
  ["Événements", "3 brouillons"],
];

const BARS: ReadonlyArray<readonly [Exclude<TabSetName, "fan">, string]> = [
  ["exhibitor", personaKindLabels.fan],
  ["visitor", personaKindLabels.visitor],
  ["pro", personaKindLabels.pro],
  ["provider", personaKindLabels.provider],
  ["media", personaKindLabels.media],
  ["organizer", personaKindLabels.organizer],
];

function Bar({ set, label, t }: { set: Exclude<TabSetName, "fan">; label: string; t: ThemeTokens }) {
  const items = tabSets[set];
  const [active, setActive] = useState<string>(items[2]?.id ?? "");
  return (
    <View style={styles.bar}>
      <Text variant="label" color={t.color.inkMuted}>
        {label}
      </Text>
      <TabBar tabs={items} active={active} onSelect={setActive} />
    </View>
  );
}

export function V2Content({ t }: { t: ThemeTokens }) {
  const theme = t.id;
  return (
    <View style={styles.stack}>
      <Text variant="label" color={t.color.inkMuted}>
        Jetons de la surcouche (tokens.v2.json)
      </Text>
      {tokensV2Overlay.map((change) => {
        const value = (change.value as Record<string, string>)[theme];
        const isColor = change.group === "color";
        return (
          <View key={`${change.group}-${change.name}`} style={styles.token}>
            <View
              style={[
                styles.swatch,
                { borderColor: t.color.line, backgroundColor: isColor && value ? value : t.color.surfaceSunken },
              ]}
            />
            <View style={styles.tokenText}>
              <Text variant="meta" color={t.color.ink}>
                {change.kind === "added" ? "+ " : ""}
                {change.group}/{change.name}
              </Text>
              <Text variant="caption" color={t.color.inkMuted}>
                {isColor && value ? `${value} · ` : ""}
                {change.why}
              </Text>
            </View>
          </View>
        );
      })}

      <Text variant="label" color={t.color.inkMuted}>
        Contour : sur photo et sur le fond
      </Text>
      <View style={[styles.photo, { backgroundColor: t.color.win }]}>
        <View style={[styles.photoBand, { backgroundColor: t.color.accent }]} />
        <OutlinedText on="photo" variant="posterXl" color={t.color.nightInk}>
          J-6
        </OutlinedText>
        <OutlinedText on="photo" variant="meta" color={t.color.nightInk}>
          19 h · ouverture
        </OutlinedText>
      </View>
      <OutlinedText on="ground" variant="posterM" color={t.color.ink}>
        Nocturne de Canet
      </OutlinedText>

      <Text variant="label" color={t.color.inkMuted}>
        Barre du haut v2
      </Text>
      <View style={styles.phone}>
        <AppBar kind="tab" inboxCount={2} />
        <AppBar kind="tab" persona={{ logoUrl: null, label: "MéditeSportCar" }} inboxOn />
        <AppBar kind="flow" title="Candidater" />
      </View>

      <Text variant="label" color={t.color.inkMuted}>
        Grands titres sur une ligne
      </Text>
      {BIG_TITLES.map(([title, label]) => (
        <BigTitle key={title} title={title} label={label} />
      ))}

      <Text variant="label" color={t.color.inkMuted}>
        Barres des six profils
      </Text>
      {BARS.map(([set, label]) => (
        <Bar key={set} set={set} label={label} t={t} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  token: { flexDirection: "row", gap: 12, alignItems: "center" },
  tokenText: { flex: 1, minWidth: 0 },
  swatch: { width: 28, height: 28, borderRadius: 8, borderWidth: 1 },
  photo: { height: 160, borderRadius: 16, padding: 12, justifyContent: "flex-end", overflow: "hidden", gap: 4 },
  photoBand: { position: "absolute", left: -40, right: -40, top: 40, height: 46, transform: [{ rotate: "-10deg" }] },
  phone: { overflow: "hidden", borderRadius: 30, marginHorizontal: -16 },
  bar: { gap: 20 },
});
