// Bloc « Ta place » de la fiche « inscrit » (lot M4, maquette 4.3, retour 27) : sur l'aplat de l'affiche, en tête de la
// fiche quand on est inscrit. Le statut (Retenue, En attente, Liste d'attente…) et le J-x, le véhicule (photo, nom
// entier, pseudo), la zone et le créneau d'arrivée des exposants (privé : seul l'exposant concerné le voit), puis
// « Se retirer » avec le délai sans pénalité. Le bouton principal de la fiche devient « Mon QR » (dans la fiche).
import { Photo, Text, tokens, useTheme } from "@orasso/design-system/native";
import { arrivalTime, eventPageLabels as L, type MyApplication, nearCountdown } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { ApplicationTag, SmallButton } from "@/features/sorties/bits";
import { formatDayHour } from "@/lib/format";
import { mediaSource } from "@/lib/media";

const { space1, space2, space3 } = tokens.spacing;

/** « 18:30 – 19:15 » ou « dès 18:30 » (chiffres étroits de la maquette). */
const slotLabel = (from: string, to: string | null) => (to ? `${from} – ${to}` : `dès ${from}`);

export function MyPlace({
  app,
  photoUrl,
  pseudo,
  now,
  busy = false,
  onWithdraw,
}: {
  app: MyApplication;
  photoUrl: string | null;
  pseudo: string;
  now: Date;
  busy?: boolean;
  onWithdraw: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const slot = app.arrival ?? null;
  const late = app.status === "accepted" && now >= new Date(app.withdrawDeadline);
  const canWithdraw = !app.checkedInAt && ["pending", "waitlisted", "accepted", "offered"].includes(app.status);
  const startsAt = app.day?.startsAt ?? app.event.startsAt;
  const live = now >= new Date(startsAt) && now < new Date(app.day?.endsAt ?? app.event.endsAt);
  return (
    <View style={[styles.box, { backgroundColor: c.poster, boxShadow: t.shadow.shadowPoster }]} testID="my-place">
      <View style={styles.head}>
        <Text variant="label" color={c.posterMuted}>
          {L.myPlace}
        </Text>
        <View style={styles.status}>
          <ApplicationTag app={app} onPoster />
          <Text variant="meta" color={c.posterMuted} testID="my-place-countdown">
            {live ? L.live : nearCountdown(startsAt, now)}
          </Text>
        </View>
      </View>
      {app.vehicle ? (
        <View style={styles.vehicle}>
          <View style={styles.thumb}>
            <Photo
              source={mediaSource(photoUrl)}
              placeholder={`linear-gradient(135deg, ${c.surfaceRaised} 0%, ${c.night} 100%)`}
              style={StyleSheet.absoluteFill}
            />
          </View>
          <View style={styles.grow}>
            {/* Nom entier, jamais coupé (il passe à la ligne). */}
            <Text variant="posterS" color={c.posterInk} style={styles.vehName}>
              {app.vehicle.label}
            </Text>
            <Text variant="caption" color={c.posterMuted} style={styles.small}>
              {pseudo} · plaque masquée
            </Text>
          </View>
        </View>
      ) : null}
      {app.status === "accepted" && (app.zone || slot) ? (
        <View style={styles.infos}>
          <View style={[styles.info, { backgroundColor: `${c.posterInk}14` }]} testID="my-place-zone">
            <Text variant="numberNarrow" color={c.posterInk} style={styles.big}>
              {app.zone?.code ?? L.noZone}
            </Text>
            <Text variant="caption" color={c.posterMuted} style={styles.small}>
              {L.myZone}
            </Text>
          </View>
          {slot ? (
            <View style={[styles.info, { backgroundColor: `${c.posterInk}14` }]} testID="my-place-arrival">
              <Text variant="numberNarrow" color={c.posterInk} style={styles.big}>
                {slotLabel(slot.from, slot.to)}
              </Text>
              <Text
                variant="caption"
                color={c.posterMuted}
                style={styles.small}
                accessibilityLabel={`${L.myArrival(slot.strict)} : ${arrivalTime(slot.from)}`}
              >
                {L.myArrival(slot.strict)}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {canWithdraw ? (
        <View style={[styles.foot, { borderTopColor: `${c.posterInk}40` }]}>
          <Text variant="caption" color={c.posterMuted} style={[styles.grow, styles.small]}>
            {app.status === "accepted"
              ? late
                ? L.withdrawLate
                : L.withdrawFree(formatDayHour(app.withdrawDeadline))
              : ""}
          </Text>
          <SmallButton kind="g" icon="close" disabled={busy} onPress={onWithdraw} testID="my-place-withdraw">
            {L.withdraw}
          </SmallButton>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // `.myplace` : rayon 20, padding 14, écart 12, sur l'aplat de l'affiche.
  box: { gap: space3, padding: 14, borderRadius: 20 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space2 },
  status: { flexDirection: "row", alignItems: "center", gap: 6 },
  vehicle: { flexDirection: "row", alignItems: "center", gap: space3 },
  thumb: { width: 64, height: 64, borderRadius: 12, overflow: "hidden" },
  grow: { flex: 1, minWidth: 0 },
  vehName: { fontSize: 14, lineHeight: 15 },
  small: { fontSize: 12, lineHeight: 16, marginTop: space1 - 1 },
  infos: { flexDirection: "row", gap: space2 },
  info: { flex: 1, padding: 10, borderRadius: 12 },
  big: { fontSize: 24, lineHeight: 22 },
  foot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderTopWidth: 1,
    borderStyle: "dashed",
    paddingTop: 10,
  },
});
