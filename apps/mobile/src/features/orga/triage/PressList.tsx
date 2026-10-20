// Tri, segment Presse (DA v2, lot 52) : les demandes d'accréditation de l'événement (lot 45), une carte par média avec
// ses formats et son message, « Accréditer » ou « Refuser » avec la raison (même feuille que le tri des véhicules).
// Pas de liste d'attente pour la presse. Le quota et les autres règles sont ceux de l'API : son message s'affiche tel quel.
import { Button, Chip, ChipRow, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type AccreditationForOrganizer,
  applicationStatusLabels,
  orgaV2Labels as L,
  mediaFormatLabels,
} from "@orasso/shared";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { decideBody } from "@/lib/triage";
import { useApi } from "@/lib/useApi";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { RefusalSheet } from "./RefusalSheet";

const { space2, space3 } = tokens.spacing;

export function PressList({ eventId, onChanged }: { eventId: string; onChanged: () => void }) {
  const { t } = useTheme();
  const list = useApi(() => api.eventAccreditations(eventId), [eventId], { refreshMs: 60_000 });
  const [busy, setBusy] = useState<string | null>(null);
  const [refusing, setRefusing] = useState<AccreditationForOrganizer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const items = list.data ?? [];
  const pending = items.filter((a) => a.status === "pending");
  const decided = items.filter((a) => a.status !== "pending");

  async function decide(a: AccreditationForOrganizer, decision: "accept" | "refuse", extra = {}) {
    setBusy(a.id);
    setError(null);
    try {
      await api.triageDecide(eventId, a.id, decideBody(decision, extra));
      await list.reload();
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.fill} testID="triage-press">
      <ScrollView contentContainerStyle={styles.content}>
        {error ? <Notice tone="error">{error}</Notice> : null}
        {list.error ? <Notice tone="error">{errorMessage(list.error)}</Notice> : null}
        {pending.length === 0 && !list.error ? (
          <Plate kind="note" testID="triage-press-empty">
            <Text variant="posterM" color={t.color.plateInk}>
              {list.loading ? "Chargement…" : L.pressEmpty}
            </Text>
          </Plate>
        ) : null}
        {pending.map((a) => (
          <Plate key={a.id} style={styles.card} testID="triage-press-card">
            <View style={styles.chips}>
              {a.media.pressCardVerified ? (
                <Chip variant="verified" surface="plate">
                  {L.pressCardVerified}
                </Chip>
              ) : null}
            </View>
            <Text variant="posterM" color={t.color.plateInk}>
              {a.media.name}
            </Text>
            <ChipRow>
              {a.formats.map((f) => (
                <Chip key={f} surface="plate">
                  {mediaFormatLabels[f]}
                </Chip>
              ))}
            </ChipRow>
            {a.message ? (
              <Text variant="body" color={t.color.plateMuted}>
                « {a.message} »
              </Text>
            ) : null}
            <View style={styles.row}>
              <Button
                variant="plate"
                tone="dashed"
                icon="close"
                disabled={busy !== null}
                onPress={() => setRefusing(a)}
                style={styles.grow}
                testID="triage-press-refuse"
              >
                {L.pressRefuse}
              </Button>
              <Button
                variant="plate"
                icon="check"
                loading={busy === a.id}
                disabled={busy !== null}
                onPress={() => void decide(a, "accept")}
                style={styles.grow}
                testID="triage-press-accept"
              >
                {L.pressAccept}
              </Button>
            </View>
          </Plate>
        ))}
        {decided.length > 0 ? <Muted variant="label">{L.pressTitle}</Muted> : null}
        {decided.map((a) => (
          <Plate key={a.id} style={styles.card} testID="triage-press-decided">
            <View style={styles.row}>
              <Text variant="bodyStrong" color={t.color.plateInk} style={styles.grow}>
                {a.media.name}
              </Text>
              <Chip surface="plate" variant={a.status === "accepted" ? "accent" : "default"}>
                {a.status === "accepted"
                  ? L.pressAccepted
                  : a.status === "refused"
                    ? L.pressRefused
                    : applicationStatusLabels[a.status]}
              </Chip>
            </View>
          </Plate>
        ))}
      </ScrollView>
      <RefusalSheet
        visible={refusing !== null}
        onClose={() => setRefusing(null)}
        onConfirm={(extra) => {
          const target = refusing;
          setRefusing(null);
          if (target) void decide(target, "refuse", extra);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { gap: space2, paddingBottom: space3 },
  card: { gap: space2, padding: space3 },
  chips: { flexDirection: "row", gap: space2 },
  row: { flexDirection: "row", gap: space2, alignItems: "center" },
  grow: { flex: 1 },
});
