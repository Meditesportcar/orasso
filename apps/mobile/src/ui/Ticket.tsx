// Ticket du socle (lot C7, d'après `.tk` de l'artefact DA v2 : `s-sorties`, `s-missions`, `s-pcand`, `s-accred`) : la
// souche de 70 px (jour, quantième Archivo condensé 38 px, mois) séparée du corps par une perforation en pointillés avec
// ses deux encoches, puis l'étiquette et le repère court (« J-6 »), le titre en affiche 15 px, une ligne de détail
// 12,5 px et de petits boutons (`.btn.sm`, `SmButton` du kit du socle, qui prennent l'encre de l'affiche dans un ticket
// mis en avant). `highlight` : le ticket mis en avant, sur l'affiche crème (`.tk.me`, noir en Sable) ; `staff` : liseré
// d'encre (`.tk.staff`). Repris du ticket de Mes sorties (lot C2a, `features/sorties/Ticket.tsx`, que le lot de Mes
// sorties fera passer ici) pour les Missions et Candidatures du prestataire et les Accréditations du média.

import { Plate, Text, useTheme } from "@orasso/design-system/native";
import { BUSINESS_TIMEZONE, wallTime, yearToShow } from "@orasso/shared";
import { createContext, type ReactNode, useContext } from "react";
import { Pressable, StyleSheet, View } from "react-native";

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
  const w = wallTime(new Date(date), BUSINESS_TIMEZONE);
  const weekday = WEEKDAYS[new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay()];
  const year = yearToShow(date, now(), BUSINESS_TIMEZONE);
  const ink = highlight ? c.posterInk : c.plateInk;
  const muted = highlight ? c.posterMuted : c.plateMuted;
  const content = (
    <>
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
      <View style={styles.body}>
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
        <Pressable
          onPress={onPressTitle ?? onPress}
          disabled={!(onPressTitle ?? onPress)}
          accessibilityRole={onPressTitle || onPress ? "link" : undefined}
          accessibilityLabel={onPressTitle || onPress ? `${title} : ouvrir la fiche` : undefined}
        >
          <Text variant="posterS" color={dim ? muted : ink} style={styles.title}>
            {title}
          </Text>
        </Pressable>
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
      </View>
    </>
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

const styles = StyleSheet.create({
  plate: { flexDirection: "row", padding: 0, borderRadius: 18, overflow: "hidden" },
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
  body: { flex: 1, minWidth: 0, gap: 7, paddingVertical: 12, paddingHorizontal: 14 },
  head: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  title: { fontSize: 15, lineHeight: 16 },
  cap: { fontSize: 12.5, lineHeight: 17 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 2 },
  pressed: { opacity: 0.92 },
});
