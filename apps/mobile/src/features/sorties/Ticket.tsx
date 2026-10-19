// Ticket de l'onglet Sorties (lot 43, prototype `s-sorties`) : la date en souche à gauche (inclinée, séparée du corps par
// une ligne de perforation), un statut, le titre, une ligne de détail, puis les actions. Un même gabarit pour une
// candidature, un billet, une mission staff, une sortie passée. Aucun néon : le seul de l'écran est le bouton principal.

import { Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { BUSINESS_TIMEZONE, wallTime } from "@orasso/shared";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

const { space1, space2, space3 } = tokens.spacing;

const WEEKDAYS = ["DIM", "LUN", "MAR", "MER", "JEU", "VEN", "SAM"];
const MONTHS = ["JANV", "FÉVR", "MARS", "AVR", "MAI", "JUIN", "JUIL", "AOÛT", "SEPT", "OCT", "NOV", "DÉC"];

export type TicketProps = {
  /** Début de l'événement : la souche en tire le jour, le quantième et le mois. */
  date: string;
  /** Le statut (`StatusTag` ou `Chip`) et, à sa droite, un repère court (« J-6 »). */
  badge?: ReactNode;
  lead?: string;
  title: string;
  /** Ligne de détail (zone, créneau d'arrivée, véhicule…). */
  detail?: string;
  /** Lignes d'aide en plus petit (délais, consignes). */
  notes?: readonly string[];
  /** Boutons et pastilles sous le texte. */
  children?: ReactNode;
  onPressTitle?: () => void;
  /** Mis en retrait : sortie passée. */
  dim?: boolean;
  testID?: string;
};

export function Ticket({ date, badge, lead, title, detail, notes, children, onPressTitle, dim, testID }: TicketProps) {
  const { t } = useTheme();
  const c = t.color;
  const w = wallTime(new Date(date), BUSINESS_TIMEZONE);
  const weekday = WEEKDAYS[new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay()];
  return (
    <Plate style={styles.plate} testID={testID}>
      <View style={[styles.stub, { borderRightColor: c.plateLine }]}>
        <View style={styles.stubInner}>
          <Text variant="meta" color={c.plateMuted}>
            {weekday}
          </Text>
          <Text variant="posterM" color={dim ? c.plateMuted : c.plateInk} style={styles.day}>
            {w.day}
          </Text>
          <Text variant="meta" color={c.plateMuted}>
            {MONTHS[w.month - 1]}
          </Text>
        </View>
      </View>
      <View style={styles.body}>
        {badge || lead ? (
          <View style={styles.head}>
            {badge}
            {lead ? (
              <Text variant="label" color={c.plateMuted}>
                {lead}
              </Text>
            ) : null}
          </View>
        ) : null}
        <Pressable
          onPress={onPressTitle}
          disabled={!onPressTitle}
          accessibilityRole={onPressTitle ? "link" : undefined}
        >
          <Text variant="posterS" color={dim ? c.plateMuted : c.plateInk}>
            {title}
          </Text>
        </Pressable>
        {detail ? (
          <Text variant="body" color={c.plateMuted}>
            {detail}
          </Text>
        ) : null}
        {notes?.map((n) => (
          <Text key={n} variant="meta" color={c.plateMuted} style={styles.note}>
            {n}
          </Text>
        ))}
        {children ? <View style={styles.actions}>{children}</View> : null}
      </View>
    </Plate>
  );
}

const styles = StyleSheet.create({
  plate: { flexDirection: "row", padding: 0, overflow: "hidden" },
  stub: {
    width: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 1.5,
    borderStyle: "dashed",
    paddingVertical: space3,
  },
  stubInner: { alignItems: "center", transform: [{ rotate: "-4deg" }] },
  day: { lineHeight: 30 },
  body: { flex: 1, gap: space1, padding: space3 },
  head: { flexDirection: "row", alignItems: "center", gap: space2, flexWrap: "wrap" },
  note: { textTransform: "none" },
  actions: { gap: space2, marginTop: space2 },
});
