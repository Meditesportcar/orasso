// « Partager sur Instagram » (lot 31) : on choisit story (9:16) ou publication (1:1), l'appli récupère la fiche rendue
// par l'API (sans plaque) puis ouvre la feuille de partage du système.

import { Button, Text, useTheme } from "@orasso/design-system/native";
import { SHARE_SIZES, type ShareFormat, shareFormatLabels, shareFormats } from "@orasso/shared";
import { useState } from "react";

import { errorMessage } from "@/lib/http";
import { type ShareOutcome, shareVehicleImage } from "@/lib/shareVehicle";
import { AppSheet } from "@/ui/AppSheet";

export function ShareSheet({
  vehicleId,
  visible,
  onClose,
}: {
  vehicleId: string;
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useTheme();
  const [busy, setBusy] = useState<ShareFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ShareOutcome | null>(null);

  async function share(format: ShareFormat) {
    setBusy(format);
    setError(null);
    setOutcome(null);
    try {
      setOutcome(await shareVehicleImage(vehicleId, format));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel="Partager sur Instagram">
      <Text variant="title" color={t.color.ink}>
        Partager sur Instagram
      </Text>
      <Text variant="body" color={t.color.inkMuted}>
        Une fiche avec la photo de couverture, le nom du véhicule et tes chiffres clés. Jamais la plaque.
      </Text>
      {shareFormats.map((f) => (
        <Button
          key={f}
          variant="secondary"
          icon="share"
          loading={busy === f}
          disabled={busy !== null && busy !== f}
          fullWidth
          onPress={() => void share(f)}
        >
          {`${shareFormatLabels[f]} · ${SHARE_SIZES[f].width}×${SHARE_SIZES[f].height}`}
        </Button>
      ))}
      {outcome === "saved" ? (
        <Text variant="caption" color={t.color.inkMuted}>
          Fiche enregistrée sur cet appareil.
        </Text>
      ) : null}
      {outcome === "unavailable" ? (
        <Text variant="caption" color={t.color.inkMuted}>
          Le partage n'est pas disponible sur cet appareil.
        </Text>
      ) : null}
      {error ? (
        <Text variant="caption" color={t.color.winText} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <Button variant="plate" icon="back" onPress={onClose} fullWidth>
        Fermer
      </Button>
    </AppSheet>
  );
}
