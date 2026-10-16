// Le Journal, derrière la cloche : le fil d'actualité des amis et les notifications de l'utilisateur dans un seul fil
// chronologique (lot 17, ARCHITECTURE-SUITE § 2.4). Sept jours en arrière, sauf ce qui n'a pas été lu.
import { Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { socialLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { api, type NotificationItem } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { appLinkOf } from "@/lib/links";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "./AppSheet";
import { Avatar } from "./Avatar";

const { space1, space2 } = tokens.spacing;

type Actor = { pseudo?: string; avatarUrl?: string | null };
const actorOf = (n: NotificationItem): Actor | null => {
  const actor = n.data?.actor;
  return actor && typeof actor === "object" ? (actor as Actor) : null;
};

export function JournalSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTheme();
  const router = useRouter();
  const list = useApi(() => api.notifications(), [visible], { enabled: visible });

  // Ouvrir le Journal, c'est lire : les pastilles de la cloche retombent.
  useEffect(() => {
    if (visible && list.data?.items.some((n) => !n.readAt)) void api.markNotificationsRead().catch(() => undefined);
  }, [visible, list.data]);

  return (
    <AppSheet visible={visible} onClose={onClose} from="top" accessibilityLabel="Journal">
      <Text variant="title" color={t.color.ink}>
        {socialLabels.journal}
      </Text>
      {list.loading ? (
        <Text variant="body" color={t.color.inkMuted}>
          Chargement…
        </Text>
      ) : list.data && list.data.items.length > 0 ? (
        list.data.items.map((n) => {
          const actor = actorOf(n);
          const link = appLinkOf(n.data?.link);
          return (
            <Pressable
              key={n.id}
              disabled={!link}
              accessibilityRole={link ? "link" : undefined}
              accessibilityLabel={n.title}
              testID="journal-item"
              onPress={() => {
                if (!link) return;
                onClose();
                router.push(link as never);
              }}
            >
              <Plate style={styles.item}>
                <View style={styles.head}>
                  {actor ? <Avatar url={actor.avatarUrl} pseudo={actor.pseudo} size={32} /> : null}
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
            </Pressable>
          );
        })
      ) : (
        <Text variant="body" color={t.color.inkMuted}>
          {list.error ? "Le Journal est hors ligne." : socialLabels.journalEmpty}
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
