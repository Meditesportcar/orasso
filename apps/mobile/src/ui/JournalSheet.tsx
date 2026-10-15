// Le Journal, derrière la cloche : notifications de l'utilisateur, de la plus récente à la plus ancienne.
// (Le fil d'actualité des structures suivies s'y fondra plus tard ; seules les notifications existent côté API.)
import { Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/endpoints";
import { formatDayHour } from "@/lib/format";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "./AppSheet";

const { space1, space2 } = tokens.spacing;

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
