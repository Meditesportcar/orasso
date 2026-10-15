// Confirmation d'un désistement. Avant le verrouillage : sans pénalité. Après : la place est perdue et un malus sera
// appliqué au règlement des points (J+2), sauf contestation (règles de l'API ; l'appli ne fait que l'annoncer).
import { type MyApplication, POINTS } from "@orasso/shared";
import { Button, Text, useTheme } from "@orasso/design-system/native";
import { useState } from "react";

import { errorMessage } from "@/lib/http";
import { formatDayHour } from "@/lib/format";
import { AppSheet } from "@/ui/AppSheet";

export function WithdrawSheet({
  app,
  now,
  onClose,
  onConfirm,
}: {
  app: MyApplication | null;
  now: Date;
  onClose: () => void;
  onConfirm: (app: MyApplication) => Promise<void>;
}) {
  const { t } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const late = app ? now >= new Date(app.withdrawDeadline) && app.status === "accepted" : false;

  return (
    <AppSheet visible={Boolean(app)} onClose={onClose} accessibilityLabel="Me désister">
      {app ? (
        <>
          <Text variant="title" color={t.color.ink}>
            Me désister ?
          </Text>
          <Text variant="body" color={t.color.ink}>
            {app.event.title} · {formatDayHour(app.event.startsAt)}
          </Text>
          <Text variant="body" color={t.color.inkMuted}>
            {late
              ? `Les inscriptions sont verrouillées : un malus de ${Math.abs(POINTS.malus)} points sera appliqué au règlement des points, deux jours après l'événement.`
              : app.status === "accepted"
                ? `Ta place retourne à la liste d'attente. Sans pénalité : le désistement est gratuit jusqu'au ${formatDayHour(app.withdrawDeadline)}.`
                : "L'organisateur est prévenu, sans pénalité."}
          </Text>
          {error ? (
            <Text variant="caption" color={t.color.winText} accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          <Button
            variant="alert"
            icon="close"
            loading={busy}
            fullWidth
            onPress={async () => {
              setBusy(true);
              setError(null);
              try {
                await onConfirm(app);
              } catch (e) {
                setError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Me désister
          </Button>
          <Button variant="plate" icon="back" disabled={busy} onPress={onClose} fullWidth>
            Garder ma place
          </Button>
        </>
      ) : null}
    </AppSheet>
  );
}
