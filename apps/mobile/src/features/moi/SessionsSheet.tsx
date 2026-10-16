// Moi > Sécurité : appareils et sessions ouverts sur mon compte (`GET /me/sessions`), avec « Déconnecter » pour
// chacun sauf celui-ci. L'adresse IP n'est jamais affichée.
import { Button, Chip, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "@/ui/AppSheet";

const { space1, space2, space3 } = tokens.spacing;

export function SessionsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTheme();
  const list = useApi(() => api.sessions(), [visible], { enabled: visible });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function revoke(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await api.revokeSession(id);
      await list.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel="Appareils et sessions">
      <Text variant="title" color={t.color.ink}>
        Appareils et sessions
      </Text>
      <Text variant="body" color={t.color.ink}>
        Les appareils connectés à ton compte. Déconnecte celui que tu ne reconnais pas, puis change ton mot de passe.
      </Text>
      {list.loading ? (
        <Text variant="body" color={t.color.inkMuted}>
          Chargement…
        </Text>
      ) : list.data && list.data.length > 0 ? (
        list.data.map((s) => (
          <Plate key={s.id} style={styles.item} testID="session-row">
            <View style={styles.head}>
              <Text variant="bodyStrong" color={t.color.plateInk} style={styles.device}>
                {s.device}
              </Text>
              {s.current ? (
                <Chip surface="plate" selected>
                  Cet appareil
                </Chip>
              ) : null}
            </View>
            <Text variant="meta" color={t.color.plateMuted}>
              Dernière activité : {formatDayHour(s.lastActiveAt)}
            </Text>
            {s.current ? null : (
              <Button
                variant="plate"
                icon="close"
                loading={busyId === s.id}
                onPress={() => void revoke(s.id)}
                fullWidth
              >
                Déconnecter
              </Button>
            )}
          </Plate>
        ))
      ) : (
        <Text variant="body" color={t.color.inkMuted}>
          {list.error ? "Impossible de charger les appareils hors ligne." : "Aucun appareil."}
        </Text>
      )}
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

const styles = StyleSheet.create({
  item: { gap: space1, padding: space3 },
  head: { flexDirection: "row", alignItems: "center", gap: space2 },
  device: { flex: 1 },
});
