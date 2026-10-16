// Carte « Demande de transfert de plaque » pour l'ancien propriétaire (lot 31, S36). Elle attend dans le Garage tant
// que la Boîte > Demandes n'existe pas (lot 18) ; elle pourra y être enregistrée telle quelle.
import { Button, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type PlateTransferView, plateTransferLabels } from "@orasso/shared";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";

const { space1, space2, space3 } = tokens.spacing;

export function PlateTransferCard({
  transfer,
  onDone,
}: {
  transfer: PlateTransferView;
  onDone: () => Promise<unknown>;
}) {
  const { t } = useTheme();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function answer(kind: "accept" | "decline") {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "accept") await api.acceptPlateTransfer(transfer.id);
      else await api.declinePlateTransfer(transfer.id);
      await onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Plate style={styles.card} accessibilityLabel={plateTransferLabels.requestTitle}>
      <Text variant="label" color={t.color.plateMuted}>
        {plateTransferLabels.requestTitle}
      </Text>
      <Text variant="body" color={t.color.plateInk}>
        {`${transfer.requesterPseudo} a saisi la plaque de ${transfer.holderVehicleLabel}${
          transfer.plate ? ` (${transfer.plate})` : ""
        } pour son véhicule. Si tu l'as vendu, confirme : ton véhicule passe « Vendu » et la plaque change de main. Sinon, l'équipe Orasso tranchera.`}
      </Text>
      <Text variant="meta" color={t.color.plateMuted}>
        {`Réponse attendue avant le ${formatDayHour(transfer.answerBy)}.`}
      </Text>
      {error ? (
        <Text variant="caption" color={t.color.winText} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <View style={styles.actions}>
        <Button
          variant="secondary"
          icon="check"
          loading={busy === "accept"}
          disabled={busy !== null}
          onPress={() => void answer("accept")}
          fullWidth
        >
          {plateTransferLabels.accept}
        </Button>
        <Button
          variant="plate"
          tone="dashed"
          icon="close"
          loading={busy === "decline"}
          disabled={busy !== null}
          onPress={() => void answer("decline")}
          fullWidth
        >
          {plateTransferLabels.decline}
        </Button>
      </View>
    </Plate>
  );
}

const styles = StyleSheet.create({
  card: { gap: space2, padding: space3 },
  actions: { gap: space2, paddingTop: space1 },
});
