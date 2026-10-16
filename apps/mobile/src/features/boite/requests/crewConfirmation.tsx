// Venues en crew à confirmer (lot 19) dans Boîte > Demandes : l'événement, le véhicule et l'échéance. La confirmation se
// fait dans Accès (règlement à accepter) ; « Je ne viens pas » répond tout de suite.
import { Button, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { crewLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { useApi } from "@/lib/useApi";
import { Avatar } from "@/ui/Avatar";

import type { RequestSectionProps } from "./types";

const { space2, space3 } = tokens.spacing;

export function CrewConfirmations({ onChanged, refreshKey }: RequestSectionProps) {
  const router = useRouter();
  const { t } = useTheme();
  const items = useApi(() => api.crewConfirmations(), [refreshKey]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      {(items.data ?? []).map((c) => (
        <Plate key={c.applicationId} style={styles.card} testID="request-crew-confirmation">
          <View style={styles.head}>
            <Avatar url={c.crew.logoUrl} pseudo={c.crew.name} size={40} />
            <View style={styles.text}>
              <Text variant="bodyStrong" color={t.color.plateInk}>
                {crewLabels.confirmTitle(c.crew.name)}
              </Text>
              <Text variant="caption" color={t.color.plateMuted}>
                {c.event.title} · {formatDayHour(c.event.startsAt)}
              </Text>
            </View>
          </View>
          {c.vehicleLabel ? (
            <Text variant="body" color={t.color.plateInk}>
              {c.vehicleLabel}
            </Text>
          ) : null}
          <Text variant="caption" color={t.color.plateMuted}>
            {crewLabels.confirmBefore(formatDayHour(c.confirmBefore))}
          </Text>
          {error && busy === null ? (
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
              loading={busy === c.applicationId}
              disabled={busy !== null}
              onPress={async () => {
                setBusy(c.applicationId);
                setError(null);
                try {
                  await api.declineCrewVenue(c.applicationId);
                  void items.reload();
                  onChanged();
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setBusy(null);
                }
              }}
            >
              {crewLabels.notComing}
            </Button>
          </View>
        </Plate>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  card: { gap: space3, padding: space3 },
  head: { flexDirection: "row", alignItems: "center", gap: space3 },
  text: { flex: 1, gap: 2 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
});
