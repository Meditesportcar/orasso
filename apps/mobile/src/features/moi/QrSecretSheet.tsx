// Moi > Sécurité : régénérer le secret du QR de compte. Les anciens codes ne passent plus (capture d'écran prêtée,
// autre appareil) ; le nouveau secret est enregistré sur cet appareil, les autres le reprendront à leur prochaine
// connexion.
import { Button, Text, useTheme } from "@orasso/design-system/native";
import { useState } from "react";

import { saveAccountQrSecret } from "@/lib/accountQrStore";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { AppSheet } from "@/ui/AppSheet";

export function QrSecretSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function close() {
    setDone(false);
    setError(null);
    onClose();
  }

  async function rotate() {
    setBusy(true);
    setError(null);
    try {
      await saveAccountQrSecret(await api.rotateAccountQrSecret());
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppSheet visible={visible} onClose={close} accessibilityLabel="Régénérer le QR de compte">
      <Text variant="title" color={t.color.ink}>
        Régénérer mon QR de compte
      </Text>
      {done ? (
        <>
          <Text variant="body" color={t.color.ink} testID="qr-rotated">
            C'est fait : ton QR de compte a un nouveau secret sur cet appareil. Sur tes autres appareils, reconnecte-toi
            pour le récupérer.
          </Text>
          <Button variant="plate" icon="check" onPress={close} fullWidth>
            Fermer
          </Button>
        </>
      ) : (
        <>
          <Text variant="body" color={t.color.ink}>
            Ton QR de compte te fait reconnaître chez les professionnels partenaires (remise selon ton grade). Il change
            toutes les 60 secondes ; si quelqu'un a pu en copier le secret, régénère-le.
          </Text>
          <Text variant="body" color={t.color.inkMuted}>
            Les anciens codes, y compris sur tes autres appareils, ne seront plus acceptés.
          </Text>
          {error ? (
            <Text variant="caption" color={t.color.winText} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button variant="alert" icon="close" loading={busy} onPress={() => void rotate()} fullWidth>
            Régénérer le secret
          </Button>
          <Button variant="plate" icon="back" disabled={busy} onPress={close} fullWidth>
            Garder le secret actuel
          </Button>
        </>
      )}
    </AppSheet>
  );
}
