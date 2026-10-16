// Boîte (lot 18, docs/02) : ce qu'on m'écrit. Segment « Messages » (amis, organisateurs ; et côté structure, les
// personnes qui écrivent à mes structures) et segment « Demandes » rangées à part (ami, contact ; les lots suivants
// branchent leurs cartes dans `features/boite/requests/`). Mise à jour en direct par le canal `user:{id}`.
import { Chip, ChipRow, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type ConversationSummary, type InboxSummary, messagingLabels } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { requestSections } from "@/features/boite/requests";
import { api } from "@/lib/api";
import { formatDay, formatHour } from "@/lib/format";
import { useChannel } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Avatar } from "@/ui/Avatar";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { TabScreen } from "@/ui/Screens";

const { space1, space2, space3 } = tokens.spacing;

const whenOf = (iso: string) =>
  new Date(iso).toDateString() === new Date().toDateString() ? formatHour(iso) : formatDay(iso);

function ConversationRow({ c, onPress }: { c: ConversationSummary; onPress: () => void }) {
  const { t } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={c.title} testID="conversation-row">
      <Plate style={styles.row}>
        <Avatar url={c.avatarUrl} pseudo={c.title} size={40} />
        <View style={styles.rowText}>
          <View style={styles.rowHead}>
            <Text variant="bodyStrong" color={t.color.plateInk} style={styles.grow}>
              {c.title}
            </Text>
            {c.lastMessage ? (
              <Text variant="meta" color={t.color.plateMuted}>
                {whenOf(c.lastMessage.at)}
              </Text>
            ) : null}
          </View>
          {c.subtitle ? (
            <Text variant="caption" color={t.color.plateMuted}>
              {c.subtitle}
            </Text>
          ) : null}
          {c.lastMessage ? (
            <Text variant="caption" color={t.color.plateMuted} numberOfLines={2}>
              {c.lastMessage.mine ? "Toi : " : ""}
              {c.lastMessage.preview}
            </Text>
          ) : null}
        </View>
        {c.unreadCount > 0 ? (
          // Pastille moutarde à plat (pas de néon : un seul par écran, celui de l'onglet Accès).
          <View style={[styles.count, { backgroundColor: t.color.accent }]}>
            <Text variant="credit" color={t.color.accentInk}>
              {c.unreadCount}
            </Text>
          </View>
        ) : null}
      </Plate>
    </Pressable>
  );
}

export default function Boite() {
  const router = useRouter();
  const { me, refreshMe } = useSession();
  const [segment, setSegment] = useState<"messages" | "requests">("messages");
  const [refreshKey, setRefreshKey] = useState(0);
  const conversations = useApi(() => api.conversations(), []);
  const summary = useApi<InboxSummary>(() => api.inboxSummary(), []);
  const requests = summary.data ? Object.values(summary.data.requests).reduce((a, b) => a + b, 0) : 0;

  const reloadAll = useCallback(async () => {
    setRefreshKey((k) => k + 1);
    await Promise.all([conversations.reload(), summary.reload(), refreshMe()]);
  }, [conversations.reload, summary.reload, refreshMe]);

  useChannel(me ? `user:${me.user.id}` : null, (event) => {
    if (event.type === "conversation.updated" || event.type === "inbox.changed" || event.type === "friend.request") {
      void reloadAll();
    }
  });

  const items = conversations.data?.items ?? [];
  return (
    <TabScreen title={messagingLabels.inbox} onRefresh={reloadAll}>
      <ChipRow>
        <Chip
          selected={segment === "messages"}
          onPress={() => setSegment("messages")}
          accessibilityLabel={messagingLabels.messages}
        >
          {`${messagingLabels.messages}${summary.data?.unreadMessages ? ` · ${summary.data.unreadMessages}` : ""}`}
        </Chip>
        <Chip
          selected={segment === "requests"}
          onPress={() => setSegment("requests")}
          accessibilityLabel={messagingLabels.requests}
        >
          {`${messagingLabels.requests}${requests ? ` · ${requests}` : ""}`}
        </Chip>
      </ChipRow>

      {conversations.offline ? <Notice>Hors ligne : dernière liste connue.</Notice> : null}

      {segment === "messages" ? (
        items.length === 0 ? (
          conversations.loading ? (
            <Muted variant="body">Chargement…</Muted>
          ) : (
            <Muted variant="body">{messagingLabels.noConversations}</Muted>
          )
        ) : (
          items.map((c) => <ConversationRow key={c.id} c={c} onPress={() => router.push(`/boite/${c.id}`)} />)
        )
      ) : (
        <View style={styles.requests}>
          {requests === 0 ? <Muted variant="body">{messagingLabels.noRequests}</Muted> : null}
          {requestSections.map(({ kind, Section }) => (
            <Section key={kind} refreshKey={refreshKey} onChanged={() => void reloadAll()} />
          ))}
        </View>
      )}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: space3, padding: space3 },
  rowText: { flex: 1, gap: space1 },
  rowHead: { flexDirection: "row", alignItems: "baseline", gap: space2 },
  grow: { flex: 1 },
  count: { minWidth: 22, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, alignItems: "center" },
  requests: { gap: space3 },
});
