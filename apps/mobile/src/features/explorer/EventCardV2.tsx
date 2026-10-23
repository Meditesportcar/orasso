// Carte d'événement v2 (lot 44, prototype `s-explore` `evc`) : souche date à gauche, puis le format et la distance, le
// nom (jamais tronqué), le logo et le nom de l'organisateur, le lieu, une jauge de places exposants ; à droite (ou en
// haut pour la première, « en vedette »), l'affiche générée (lot 47), ou le gabarit « Minimal » sans photo : jamais de
// rectangle vide. Réutilisée par l'Explorer du média (lot 55) et la carte (aperçu sous l'épingle).
// Lot M4 (maquette 3.1, retour 19) : `portrait`, la mise en page unique de l'Explorer : l'affiche en portrait (4:5,
// 116 px) à gauche, les infos à droite (format, distance, « SAM. 24 OCT. · 19 H », nom, organisateur avec son logo et
// son nom jamais coupé, lieu, jauge) ; plus de grande bande paysage en tête de liste.
import { Chip, Icon, Photo, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type EventCard, eventFormatLabels, explorerV2Labels as L, wallTime } from "@orasso/shared";
import { useRef } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";

import type { PosterRect } from "@/lib/eventPreview";
import { mediaSource } from "@/lib/media";
import { cardPoster } from "./poster";

const { space1, space2, space3 } = tokens.spacing;
const DAYS = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];
const MONTHS = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];

/** Souche : « Sam. » / « 24 » / « Oct. » / « 19 h » (heure de Paris). */
export function stubOf(iso: string): { day: string; date: string; month: string; hour: string } {
  const w = wallTime(new Date(iso));
  const weekday = new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay();
  return {
    day: DAYS[weekday] ?? "",
    date: String(w.day),
    month: MONTHS[w.month - 1] ?? "",
    hour: w.minute === 0 ? `${w.hour} h` : `${w.hour} h ${String(w.minute).padStart(2, "0")}`,
  };
}

/** Jauge des places : part prise (0 → 1), texte ; `null` sans limite. */
export function seatsOf(
  e: Pick<EventCard, "capacity" | "remaining">,
): { taken: number; text: string; full: boolean } | null {
  if (e.capacity === null || e.remaining === null) return null;
  const left = Math.max(0, e.remaining);
  return {
    taken: e.capacity > 0 ? (e.capacity - left) / e.capacity : 1,
    text: left > 0 ? L.seatsLeft(left, e.capacity) : L.seatsFull(e.capacity),
    full: left === 0,
  };
}

/** Initiales d'une structure (logo absent). */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

/** Gabarit « Minimal » (sans photo) : le format et le nom sur l'aplat de l'affiche. */
export function MinimalPoster({ event, big }: { event: Pick<EventCard, "format" | "title">; big: boolean }) {
  const { t } = useTheme();
  return (
    <View style={[styles.minimal, { backgroundColor: t.color.poster }]} testID="poster-minimal">
      {/* Le format seulement en grand : dans la vignette de 84 px, il se couperait au milieu du mot. */}
      {big ? (
        <Text variant="label" color={t.color.posterMuted}>
          {eventFormatLabels[event.format]}
        </Text>
      ) : null}
      <Text variant={big ? "posterM" : "posterS"} color={t.color.posterInk}>
        {event.title}
      </Text>
      <Text variant="credit" color={t.color.posterMuted}>
        Orasso
      </Text>
    </View>
  );
}

export function EventCardV2({
  event,
  big = false,
  portrait = false,
  onPress,
  onPressIn,
}: {
  event: EventCard;
  big?: boolean;
  /** Lot M4 : affiche en portrait à gauche, infos à droite (Explorer, carte). */
  portrait?: boolean;
  /** Lot M3 : reçoit la place de l'affiche dans la fenêtre (transition vers l'en-tête de la fiche). */
  onPress: (poster: PosterRect | null) => void;
  /** Lot M3 : au premier contact du doigt (la fiche se charge dès le toucher). */
  onPressIn?: () => void;
}) {
  const { t } = useTheme();
  const posterRef = useRef<View>(null);
  const press = () => {
    const node = posterRef.current;
    if (!node?.measureInWindow) {
      onPress(null);
      return;
    }
    node.measureInWindow((x, y, width, height) => onPress(width > 0 ? { x, y, width, height } : null));
  };
  const c = t.color;
  const stub = stubOf(event.startsAt);
  const seats = seatsOf(event);
  const km = event.distanceKm;
  const poster = cardPoster(event) ? (
    <Photo source={mediaSource(cardPoster(event))} cut={big ? "none" : "poster"} style={StyleSheet.absoluteFill} />
  ) : (
    <MinimalPoster event={event} big={big} />
  );

  const stubView = (
    <View style={[styles.stub, { borderRightColor: c.plateLine }]}>
      <Text variant="label" color={c.plateMuted}>
        {stub.day}
      </Text>
      <Text variant="numberNarrow" color={c.plateInk} style={styles.stubDate}>
        {stub.date}
      </Text>
      <Text variant="label" color={c.plateMuted}>
        {stub.month}
      </Text>
      <Text variant="meta" color={c.accentText} style={styles.stubHour}>
        {stub.hour}
      </Text>
    </View>
  );

  const main = (
    <View style={styles.main}>
      <View style={styles.top}>
        <Chip surface="plate" variant={big ? "accent" : "default"}>
          {eventFormatLabels[event.format]}
        </Chip>
        {km !== undefined && km !== null ? (
          <Text variant="meta" color={c.plateMuted} testID="event-km">
            {L.km(km)}
          </Text>
        ) : null}
      </View>
      {portrait ? (
        <Text variant="label" color={c.accentText} style={styles.when} testID="event-when">
          {`${stub.day} ${stub.date} ${stub.month} · ${stub.hour}`}
        </Text>
      ) : null}
      <Text variant={big ? "posterM" : "posterS"} color={c.plateInk} style={portrait ? styles.portraitTitle : null}>
        {event.title}
      </Text>
      <View style={styles.org}>
        {event.structure.logoUrl ? (
          <Image source={{ uri: event.structure.logoUrl }} style={styles.logo} accessibilityIgnoresInvertColors />
        ) : (
          <View style={[styles.logo, { backgroundColor: c.night }]}>
            <Text variant="label" color={c.nightInk}>
              {initials(event.structure.name)}
            </Text>
          </View>
        )}
        <Text variant="bodyStrong" color={c.plateInk} style={styles.orgName}>
          {event.structure.name}
        </Text>
        <View accessibilityLabel={L.verified}>
          <Icon name="badge" size={16} color={c.accent} />
        </View>
      </View>
      {event.city || event.department ? (
        <View style={styles.place}>
          <Icon name="place" size={14} color={c.plateMuted} />
          <Text variant="meta" color={c.plateMuted} style={styles.placeText}>
            {[event.city, event.department].filter(Boolean).join(" · ")}
          </Text>
        </View>
      ) : null}
      <View style={styles.seats}>
        <View style={[styles.gauge, { backgroundColor: c.plateLine }]}>
          {seats ? (
            <View
              style={[
                styles.gaugeFill,
                {
                  width: `${Math.round(seats.taken * 100)}%`,
                  backgroundColor: seats.taken > 0.7 ? c.accent : c.plateInk,
                },
              ]}
            />
          ) : null}
        </View>
        <Text variant="meta" color={c.plateMuted} testID="event-seats">
          {seats ? seats.text : L.seatsFree}
        </Text>
      </View>
    </View>
  );

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={event.title}
      onPress={press}
      onPressIn={onPressIn}
      testID="event-row"
    >
      <Plate style={[styles.card, big && styles.cardBig]}>
        {seats?.full ? (
          <View style={styles.flag}>
            <Chip surface="plate">{L.waitlistFlag}</Chip>
          </View>
        ) : null}
        {portrait && !big ? (
          <View style={styles.row}>
            <View ref={posterRef} collapsable={false} style={styles.posterPortrait}>
              {poster}
            </View>
            {main}
          </View>
        ) : big ? (
          <>
            <View ref={posterRef} collapsable={false} style={styles.posterBig}>
              {poster}
            </View>
            <View style={styles.bigBody}>
              {stubView}
              {main}
            </View>
          </>
        ) : (
          <View style={styles.row}>
            {stubView}
            {main}
            <View ref={posterRef} collapsable={false} style={styles.poster}>
              {poster}
            </View>
          </View>
        )}
      </Plate>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { padding: space2, overflow: "hidden" },
  cardBig: { padding: 0 },
  row: { flexDirection: "row", gap: space3, alignItems: "stretch" },
  bigBody: { flexDirection: "row", gap: space3, padding: space3 },
  stub: {
    width: 56,
    alignItems: "center",
    paddingTop: space1,
    paddingRight: space2,
    borderRightWidth: 1.5,
    borderStyle: "dashed",
  },
  stubDate: { fontSize: tokens.type.posterXl.fontSize, lineHeight: tokens.type.posterXl.fontSize },
  stubHour: { marginTop: space1 },
  main: { flex: 1, gap: space1, minWidth: 0 },
  top: { flexDirection: "row", alignItems: "center", gap: space2, flexWrap: "wrap" },
  org: { flexDirection: "row", alignItems: "center", gap: space2 },
  orgName: { flexShrink: 1 },
  logo: { width: 24, height: 24, borderRadius: tokens.radius.radiusSm, alignItems: "center", justifyContent: "center" },
  place: { flexDirection: "row", alignItems: "center", gap: space1 },
  placeText: { flexShrink: 1 },
  seats: { gap: space1, marginTop: "auto" },
  gauge: { height: 5, borderRadius: tokens.radius.radiusPill, overflow: "hidden" },
  gaugeFill: { height: 5, borderRadius: tokens.radius.radiusPill },
  poster: { width: 84, minHeight: 118, borderRadius: tokens.radius.radiusSm, overflow: "hidden" },
  posterBig: { height: 220, overflow: "hidden" },
  // `.xc-aff` : 116 px de large, 4:5, rayon 12.
  posterPortrait: { width: 116, aspectRatio: 4 / 5, borderRadius: 12, overflow: "hidden", alignSelf: "flex-start" },
  when: { fontSize: 12, lineHeight: 15 },
  portraitTitle: { fontSize: 15.5, lineHeight: 16 },
  minimal: { flex: 1, padding: space2, gap: space1, justifyContent: "space-between" },
  flag: { position: "absolute", top: space2, right: space2, zIndex: 3 },
});
