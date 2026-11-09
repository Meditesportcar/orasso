// Lot R7m1 (maquette R7.20 `pq_end`) : la feuille de confirmation « Mettre fin au partenariat ? », la même pour le passionné
// (depuis la ligne « Partenaires » de son profil) et pour le pro (depuis sa fiche). Un geste, un message clair : l'autre est
// prévenu, les contenus déjà publiés gardent leur mention (R7m2).
import { Button, Text, useTheme } from "@orasso/design-system/native";
import { partnershipLabels as L } from "@orasso/shared";
import { useState } from "react";

import { errorMessage } from "@/lib/http";
import { AppSheet } from "@/ui/AppSheet";
import { Notice } from "@/ui/Notice";

export function EndSheet({
  visible,
  name,
  forPro = false,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  /** Le pro (côté passionné) ou le passionné (côté pro) à qui l'on met fin. */
  name: string;
  forPro?: boolean;
  onClose: () => void;
  onConfirm: () => Promise<unknown>;
}) {
  const { t } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel={L.endTitle}>
      <Text variant="posterM" color={t.color.ink} accessibilityRole="header" style={{ fontSize: 18, lineHeight: 20 }}>
        {L.endTitle}
      </Text>
      <Text variant="body" color={t.color.inkMuted}>
        {`${name} · ${forPro ? L.endBodyForPro : L.endBody}`}
      </Text>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button
        variant="secondary"
        icon="close"
        fullWidth
        loading={busy}
        onPress={() => void confirm()}
        testID="partnership-end-confirm"
      >
        {L.end}
      </Button>
      <Button variant="secondary" icon="back" fullWidth disabled={busy} onPress={onClose} testID="partnership-end-keep">
        {L.endKeep}
      </Button>
    </AppSheet>
  );
}
