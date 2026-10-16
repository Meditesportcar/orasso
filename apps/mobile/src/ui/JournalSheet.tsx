// Le Journal, derrière la cloche : notifications de l'utilisateur, de la plus récente à la plus ancienne.
// (Le fil d'actualité des structures suivies s'y fondra plus tard ; seules les notifications existent côté API.)
import { Button, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { SET_OUTLOOK_UNCERTAIN_ACTION, weatherTexts } from "@orasso/shared";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { api, type NotificationItem } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { ApiRequestError } from "@/lib/http";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "./AppSheet";

const { space1, space2 } = tokens.spacing;

/** Suggestion météo (lot 28) : le bouton passe l'événement en Incertain sans quitter le Journal. */
function UncertainAction({ eventId }: { eventId: string }) {
  const { t } = useTheme();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  if (state === "done") {
    return (
      <Text variant="meta" color={t.color.plateMuted}>
        Passé en Incertain : les inscrits sont prévenus.
      </Text>
    );
  }
  return (
    <>
      <Button
        variant="plate"
        icon="wait"
        loading={state === "busy"}
        onPress={async () => {
          setState("busy");
          setError(null);
          try {
            await api.setOutlook(eventId, "uncertain");
            setState("done");
          } catch (e) {
            setState("idle");
            setError(
              e instanceof ApiRequestError && e.status === 403
                ? "Active la double authentification (Moi, Sécurité) pour modifier l'événement depuis l'appli."
                : e instanceof Error
                  ? e.message
                  : "Échec, réessaie.",
            );
          }
        }}
      >
        {weatherTexts.suggestionAction}
      </Button>
      {error ? (
        <Text variant="meta" color={t.color.plateMuted} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </>
  );
}

const asksUncertain = (n: NotificationItem) =>
  n.data?.action === SET_OUTLOOK_UNCERTAIN_ACTION && typeof n.data.eventId === "string";

export function JournalSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTheme();
  const list = useApi(() => api.notifications(), [visible], { enabled: visible });

  // Ouvrir le Journal, c'est lire : les pastilles de la cloche retombent.
  useEffect(() => {
    if (visible && list.data?.items.some((n) => !n.readAt)) void api.markNotificationsRead().catch(() => undefined);
  }, [visible, list.data]);

  return (
    <AppSheet visible={visible} onClose={onClose} from="top" accessibilityLabel="Journal">
      <Text variant="title" color={t.color.ink}>
        Journal
      </Text>
      {list.loading ? (
        <Text variant="body" color={t.color.inkMuted}>
          Chargement…
        </Text>
      ) : list.data && list.data.items.length > 0 ? (
        list.data.items.map((n) => (
          <Plate key={n.id} style={styles.item}>
            <View style={styles.head}>
              <Text variant="bodyStrong" color={t.color.plateInk} style={styles.title}>
                {n.title}
              </Text>
              {!n.readAt ? <View style={[styles.dot, { backgroundColor: t.color.accent }]} /> : null}
            </View>
            {n.body ? (
              <Text variant="body" color={t.color.plateMuted}>
                {n.body}
              </Text>
            ) : null}
            {asksUncertain(n) ? <UncertainAction eventId={String(n.data?.eventId)} /> : null}
            <Text variant="meta" color={t.color.plateMuted}>
              {formatDayHour(n.createdAt)}
            </Text>
          </Plate>
        ))
      ) : (
        <Text variant="body" color={t.color.inkMuted}>
          {list.error ? "Le Journal est hors ligne." : "Rien pour l'instant : tes notifications apparaîtront ici."}
        </Text>
      )}
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  item: { padding: 12, gap: space1 },
  head: { flexDirection: "row", alignItems: "center", gap: space2 },
  title: { flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
