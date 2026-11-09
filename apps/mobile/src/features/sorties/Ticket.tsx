// Ticket de l'onglet Sorties (lot 43 ; lot C2a : reproduit d'après `.tk` de l'artefact DA v2 `s-sorties`) : la souche
// de 70 px (jour, quantième Archivo condensé 38 px, mois) séparée du corps par une perforation en pointillés avec ses
// deux encoches, puis l'étiquette et le repère court (« J-6 »), le titre en affiche 15 px, une ligne de détail 12,5 px
// et de petits boutons (`.btn.sm`). `highlight` : le ticket mis en avant, sur l'affiche crème (`.tk.me`, noir en
// Sable) ; `staff` : liseré d'encre (`.tk.staff`). Un même gabarit pour une candidature, un billet, une mission staff,
// une sortie passée (et les missions du prestataire et les accréditations du média).

import { Plate, Text, useTheme } from "@orasso/design-system/native";
import { BUSINESS_TIMEZONE, wallTime, yearToShow } from "@orasso/shared";
import { createContext, type ReactNode, useContext, useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";

import { fitTitle } from "@/features/home/fit";
import { now } from "@/lib/clock";

const WEEKDAYS = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];
const MONTHS = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];

/** Vrai dans un ticket mis en avant (crème) : les petits boutons et étiquettes prennent l'encre de l'affiche. */
const TicketPoster = createContext(false);
export const useOnTicketPoster = () => useContext(TicketPoster);

export type TicketProps = {
  /** Début de l'événement : la souche en tire le jour, le quantième et le mois. */
  date: string;
  /** Le statut (étiquette) et, à sa droite, un repère court (« J-6 »). */
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
  /** Lot M4 (retour 27) : toucher le ticket ouvre la fiche de l'événement (les boutons gardent leur action). */
  onPress?: () => void;
  /** Mis en retrait : sortie passée. */
  dim?: boolean;
  /** Le ticket mis en avant (`.tk.me`) : fond d'affiche. */
  highlight?: boolean;
  /** Mission staff (`.tk.staff`) : liseré d'encre de 2 px. */
  staff?: boolean;
  testID?: string;
};

export function Ticket({
  date,
  badge,
  lead,
  title,
  detail,
  notes,
  children,
  onPressTitle,
  onPress,
  dim,
  highlight = false,
  staff = false,
  testID,
}: TicketProps) {
  const { t } = useTheme();
  const c = t.color;
  // Le titre ne se coupe qu'entre deux mots (lot R7-0, tour 2) : son corps suit le mot le plus large, police du système comprise.
  const { fontScale } = useWindowDimensions();
  const [bodyW, setBodyW] = useState(0);
  const [plateW, setPlateW] = useState(0);
  // Lot R7-0, tour 3 : jamais sous 11 ; si le mot le plus long ne tient pas à 11 dans la colonne, le titre passe sur toute
  // la largeur du ticket (sous la date et l'en-tête) au lieu de rétrécir.
  const { size: titleSize, full: titleFull } = fitTitle(
    title,
    bodyW - 2 * BODY_PAD,
    plateW - 2 * BODY_PAD,
    fontScale,
    styles.title.fontSize,
  );
  const w = wallTime(new Date(date), BUSINESS_TIMEZONE);
  const weekday = WEEKDAYS[new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay()];
  const year = yearToShow(date, now(), BUSINESS_TIMEZONE);
  const ink = highlight ? c.posterInk : c.plateInk;
  const muted = highlight ? c.posterMuted : c.plateMuted;
  const titleNode = (
    <Pressable
      onPress={onPressTitle ?? onPress}
      disabled={!(onPressTitle ?? onPress)}
      accessibilityRole={onPressTitle || onPress ? "link" : undefined}
      accessibilityLabel={onPressTitle || onPress ? `${title} : ouvrir la fiche` : undefined}
    >
      <Text
        variant="posterS"
        color={dim ? muted : ink}
        style={[styles.title, { fontSize: titleSize, lineHeight: Math.round(titleSize * 1.07) }]}
      >
        {title}
      </Text>
    </Pressable>
  );
  const rest = (
    <>
      {detail ? (
        <Text variant="caption" color={muted} style={styles.cap}>
          {detail}
        </Text>
      ) : null}
      {notes?.map((n) => (
        <Text key={n} variant="caption" color={muted} style={styles.cap}>
          {n}
        </Text>
      ))}
      {children ? <View style={styles.actions}>{children}</View> : null}
    </>
  );
  const top = (
    <View style={styles.row} onLayout={(e) => setPlateW(e.nativeEvent.layout.width)}>
      <View style={[styles.stub, { borderRightColor: highlight ? c.posterMuted : c.plateLine }]}>
        <Text variant="label" color={muted} style={styles.stubSmall}>
          {weekday}
        </Text>
        <Text variant="numberNarrow" color={dim ? muted : ink} style={styles.day}>
          {w.day}
        </Text>
        <Text variant="label" color={muted} style={styles.stubSmall}>
          {MONTHS[w.month - 1]}
        </Text>
        {/* Lot R3b : l'année, hors de l'année en cours (sinon « 17 oct. 2027 » se lit comme passé). */}
        {year !== null ? (
          <Text variant="label" color={muted} style={styles.stubSmall} testID="ticket-year">
            {year}
          </Text>
        ) : null}
        {/* Les deux encoches de la perforation, de la couleur du fond. */}
        <View style={[styles.notch, styles.notchTop, { backgroundColor: c.ground }]} />
        <View style={[styles.notch, styles.notchBottom, { backgroundColor: c.ground }]} />
      </View>
      <View style={styles.body} onLayout={(e) => setBodyW(e.nativeEvent.layout.width)}>
        {badge || lead ? (
          <View style={styles.head}>
            {badge}
            {lead ? (
              <Text variant="caption" color={muted} style={styles.cap}>
                {lead}
              </Text>
            ) : null}
          </View>
        ) : null}
        {titleFull ? null : titleNode}
        {titleFull ? null : rest}
      </View>
    </View>
  );
  const content = titleFull ? (
    <>
      {top}
      <View style={styles.wide}>
        {titleNode}
        {rest}
      </View>
    </>
  ) : (
    top
  );
  const ticket = highlight ? (
    <View style={[styles.plate, { backgroundColor: c.poster, boxShadow: t.shadow.shadowCard }]} testID={testID}>
      {content}
    </View>
  ) : (
    <Plate style={[styles.plate, staff ? { borderWidth: 2, borderColor: c.ink } : null] as never} testID={testID}>
      {content}
    </Plate>
  );
  return (
    <TicketPoster.Provider value={highlight}>
      {onPress ? (
        // Tour 2 (relecture Opus) : la zone tactile du ticket n'est pas un élément d'accessibilité ; sinon VoiceOver et
        // TalkBack la lisent d'un bloc et les boutons (Mon accès, Se retirer, Voter) deviennent inaccessibles. Lecteur
        // d'écran : le titre est le lien vers la fiche, chaque bouton reste atteignable seul.
        <Pressable
          onPress={onPress}
          accessible={false}
          importantForAccessibility="no"
          style={({ pressed }) => (pressed ? styles.pressed : null)}
          testID={testID ? `${testID}-open` : undefined}
        >
          {ticket}
        </Pressable>
      ) : (
        ticket
      )}
    </TicketPoster.Provider>
  );
}

/** Marge latérale du texte d'un ticket. */
const BODY_PAD = 14;

const styles = StyleSheet.create({
  plate: { flexDirection: "column", padding: 0, borderRadius: 18, overflow: "hidden" },
  row: { flexDirection: "row" },
  // Titre passé sur toute la largeur du ticket (lot R7-0, tour 3) : sous la date et l'en-tête.
  wide: { gap: 7, paddingBottom: 12, paddingHorizontal: BODY_PAD },
  stub: {
    width: 70,
    alignItems: "center",
    justifyContent: "center",
    borderRightWidth: 2,
    borderStyle: "dashed",
    paddingVertical: 12,
    gap: 1,
  },
  stubSmall: { fontSize: 10.5, lineHeight: 13, fontWeight: "800" },
  day: { fontSize: 38, lineHeight: 34 },
  notch: { position: "absolute", right: -9, width: 16, height: 16, borderRadius: 8 },
  notchTop: { top: -8 },
  notchBottom: { bottom: -8 },
  body: { flex: 1, minWidth: 0, gap: 7, paddingVertical: 12, paddingHorizontal: BODY_PAD },
  head: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  title: { fontSize: 15, lineHeight: 16 },
  cap: { fontSize: 12.5, lineHeight: 17 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  pressed: { opacity: 0.92 },
});
