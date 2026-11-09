// Invitations à un événement (lot 25 ; cartes sur `GET /me/requests`, lot R7c2) : celle d'un organisateur (`source
// organizer` : la réponse, véhicule et règlement, se fait dans Accès comme la confirmation d'une venue en crew) et celle de
// passionnés (`source peer` : « Kenji_66 et Julie_66 t'invitent », on répond sur la fiche de l'événement).
import { Button, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { eventInviteLabels, invitationLabels as L } from "@orasso/shared";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { formatDayHour } from "@/lib/format";
import { Avatar } from "@/ui/Avatar";

import { fromOf, payloadObject, payloadString, type RequestCardProps, textOf } from "./types";

const { space2, space3 } = tokens.spacing;

const listOf = (item: RequestCardProps["item"], key: string): Record<string, unknown>[] => {
  const v = item.payload[key];
  return Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object") : [];
};

export function EventInvitationRequest({ item }: RequestCardProps) {
  const router = useRouter();
  const { t } = useTheme();
  const { name, imageUrl } = fromOf(item);
  const event = payloadObject(item, "event");
  const slug = textOf(event, "slug");
  const startsAt = textOf(event, "startsAt");
  const peer = item.payload.source === "peer";
  const inviters = listOf(item, "inviters").map((x) => textOf(x, "pseudo")).filter(Boolean) as string[];
  const total = typeof item.payload.invitersCount === "number" ? item.payload.invitersCount : inviters.length;
  const who = inviters.length ? inviters : [name];
  const more = Math.max(0, total - who.length);
  const heading = peer
    ? `${who.join(" et ")}${more > 0 ? ` et ${more} autre${more > 1 ? "s" : ""}` : ""} ${total > 1 ? "t'invitent" : "t'invite"}`
    : L.invitedBy(name);
  const vehicleLabel = payloadString(item, "vehicleLabel");
  const message = payloadString(item, "message");
  const lockAt = payloadString(item, "lockAt");
  const notes = listOf(item, "notes");
  return (
    <Plate style={styles.card} testID={peer ? "request-event-invitation-peer" : "received-invitation"}>
      <View style={styles.head}>
        <Avatar url={imageUrl} pseudo={name} size={40} />
        <View style={styles.text}>
          <Text variant="label" color={t.color.plateMuted}>
            {heading}
          </Text>
          <Text variant="bodyStrong" color={t.color.plateInk}>
            {textOf(event, "title")}
          </Text>
          <Text variant="caption" color={t.color.plateMuted}>
            {startsAt ? formatDayHour(startsAt) : ""}
            {textOf(event, "city") ? ` · ${textOf(event, "city")}` : ""}
          </Text>
        </View>
      </View>
      {vehicleLabel ? (
        <Text variant="body" color={t.color.plateInk}>
          {L.invitedVehicle(vehicleLabel)}
        </Text>
      ) : null}
      {message ? (
        <Text variant="body" color={t.color.plateMuted}>
          {message}
        </Text>
      ) : null}
      {notes.map((n) => (
        <Text key={`${textOf(n, "pseudo")}`} variant="caption" color={t.color.plateMuted}>
          {`${textOf(n, "pseudo")} : « ${textOf(n, "note")} »`}
        </Text>
      ))}
      {lockAt ? (
        <Text variant="caption" color={t.color.plateMuted}>
          {L.validUntil(formatDayHour(lockAt))}
        </Text>
      ) : null}
      <View style={styles.row}>
        {peer ? null : (
          <Button variant="plate" icon="entry" onPress={() => router.push("/acces")} testID="invitation-answer">
            {L.answer}
          </Button>
        )}
        {slug ? (
          <Button variant="plate" icon="explore" onPress={() => router.push(`/e/${slug}`)}>
            {peer ? eventInviteLabels.seeEvent : L.openEvent}
          </Button>
        ) : null}
      </View>
    </Plate>
  );
}

const styles = StyleSheet.create({
  card: { gap: space3, padding: space3 },
  head: { flexDirection: "row", alignItems: "center", gap: space3 },
  text: { flex: 1, gap: 2 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
});
