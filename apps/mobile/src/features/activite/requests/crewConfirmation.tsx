// Venue en crew à confirmer (lot 19 ; carte sur `GET /me/requests`, `kind crew` variante `confirmation`, lot R7c2) :
// l'événement, le véhicule et l'échéance. La confirmation se fait dans Accès (règlement à accepter) ; « Je ne viens pas »
// répond tout de suite (`id` = la candidature).
import { Button, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { crewLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { Avatar } from "@/ui/Avatar";

import { fromOf, payloadObject, payloadString, type RequestCardProps, textOf } from "./types";

const { space2, space3 } = tokens.spacing;

export function CrewConfirmation({ item, onDone }: RequestCardProps) {
  const router = useRouter();
  const { t } = useTheme();
  const { name, imageUrl } = fromOf(item);
  const event = payloadObject(item, "event");
  const startsAt = textOf(event, "startsAt");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vehicleLabel = payloadString(item, "vehicleLabel");
  const before = payloadString(item, "confirmBefore");
  return (
    <Plate style={styles.card} testID="request-crew-confirmation">
      <View style={styles.head}>
        <Avatar url={imageUrl} pseudo={name} size={40} />
        <View style={styles.text}>
          <Text variant="bodyStrong" color={t.color.plateInk}>
            {crewLabels.confirmTitle(textOf(payloadObject(item, "crew"), "name") ?? name)}
          </Text>
          <Text variant="caption" color={t.color.plateMuted}>
            {textOf(event, "title")}
            {startsAt ? ` · ${formatDayHour(startsAt)}` : ""}
          </Text>
        </View>
      </View>
      {vehicleLabel ? (
        <Text variant="body" color={t.color.plateInk}>
          {vehicleLabel}
        </Text>
      ) : null}
      {before ? (
        <Text variant="caption" color={t.color.plateMuted}>
          {crewLabels.confirmBefore(formatDayHour(before))}
        </Text>
      ) : null}
      {error ? (
        <Text variant="caption" color={t.color.winText} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Button variant="plate" icon="qr" onPress={() => router.push("/acces")}>
          {crewLabels.confirmVenue}
        </Button>
        <Button
          variant="plate"
          tone="dashed"
          icon="close"
          loading={busy}
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            setError(null);
            try {
              await api.declineCrewVenue(item.id);
              onDone();
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {crewLabels.notComing}
        </Button>
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
