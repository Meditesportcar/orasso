// Demande d'autorisation des notifications, proposée juste après une candidature (docs/01) : jamais au premier
// lancement. Disparaît quand l'autorisation est accordée ou refusée.
import { Button, Text, useTheme } from "@orasso/design-system/native";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { askNotificationPermission, notificationPermission, type PermissionState } from "@/lib/push";

export function NotificationAsk({ reason, onDone }: { reason: string; onDone?: (state: PermissionState) => void }) {
  const { t } = useTheme();
  const [state, setState] = useState<PermissionState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void notificationPermission().then(setState);
  }, []);

  if (state !== "undetermined") return null;
  return (
    <View style={styles.box}>
      <Text variant="body" color={t.color.ink}>
        {reason}
      </Text>
      <Button
        variant="primary"
        icon="bell"
        loading={busy}
        onPress={async () => {
          setBusy(true);
          const next = await askNotificationPermission();
          setBusy(false);
          setState(next);
          onDone?.(next);
        }}
      >
        Activer les notifications
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({ box: { gap: 12 } });
