// Boîte (lot 18, docs/02 ; lot C2a : feuille de l'artefact DA v2 `sh-inbox`). Ouverte par l'icône de la barre du haut,
// elle monte en feuille par-dessus l'écran (route en modale transparente) : poignée, « Boîte » et ✕, puis trois segments
// `.seg` — « Tout » (messages non lus, demandes et notifications : l'ancien Journal de la cloche y est fondu),
// « Messages » (amis, organisateurs, crews) et « Demandes » (ami, contact, crew, staff, invitations, transferts de
// plaque ; `features/boite/requests/`). Lignes `.cap` : logo ou avatar 44 px, nom en gras, aperçu, pastille moutarde.
// Mise à jour en direct par le canal `user:{id}`.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { type ConversationSummary, type InboxSummary, messagingLabels } from "@orasso/shared";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CapRow, Count } from "@/features/boite/CapRow";
import { NotificationRow } from "@/features/boite/NotificationRow";
import { requestSections } from "@/features/boite/requests";
import { Seg } from "@/features/sorties/bits";
import { api } from "@/lib/api";
import { formatDay, formatHour } from "@/lib/format";
import { useChannel } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Avatar } from "@/ui/Avatar";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";

const { space2, space3 } = tokens.spacing;

type Segment = "all" | "messages" | "requests";

const whenOf = (iso: string) =>
  new Date(iso).toDateString() === new Date().toDateString() ? formatHour(iso) : formatDay(iso);

function ConversationRow({ c, onPress }: { c: ConversationSummary; onPress: () => void }) {
  const preview = c.lastMessage ? `${c.lastMessage.mine ? "Toi : " : ""}${c.lastMessage.preview}` : null;
  return (
    <CapRow
      testID="conversation-row"
      leading={<Avatar url={c.avatarUrl} pseudo={c.title} size={44} />}
      title={c.title}
      lines={[c.subtitle, preview, c.lastMessage ? whenOf(c.lastMessage.at) : null]}
      trailing={c.unreadCount > 0 ? <Count n={c.unreadCount} /> : null}
      onPress={onPress}
    />
  );
}

export default function Boite() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { me, refreshMe } = useSession();
  // Lot 40 : `/boite?segment=demandes` (lien `/app/boite/demandes` du site) ouvre directement les Demandes.
  const params = useLocalSearchParams<{ segment?: string }>();
  const [segment, setSegment] = useState<Segment>(
    params.segment === "demandes" ? "requests" : params.segment === "messages" ? "messages" : "all",
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const conversations = useApi(() => api.conversations(), []);
  const summary = useApi<InboxSummary>(() => api.inboxSummary(), []);
  const notifications = useApi(() => api.notifications(), [refreshKey]);
  // Transferts de plaque reçus (lot 40) : comptés ici, `GET /inbox/summary` ne les compte pas.
  const transfers = useApi(() => api.plateTransfers(), [refreshKey]);
  const requests =
    (summary.data ? Object.values(summary.data.requests).reduce((a, b) => a + b, 0) : 0) +
    (transfers.data?.incoming.length ?? 0);
  const unreadMessages = summary.data?.unreadMessages ?? 0;
  const unreadNotifications = (notifications.data?.items ?? []).filter((n) => !n.readAt).length;
  const total = unreadMessages + requests + unreadNotifications;

  const reloadAll = useCallback(async () => {
    setRefreshKey((k) => k + 1);
    await Promise.all([conversations.reload(), summary.reload(), refreshMe()]);
  }, [conversations.reload, summary.reload, refreshMe]);

  useChannel(me ? `user:${me.user.id}` : null, (event) => {
    if (event.type === "conversation.updated" || event.type === "inbox.changed" || event.type === "friend.request") {
      void reloadAll();
    }
  });

  // « Tout » montre les notifications : les ouvrir, c'est les lire (comme l'ancien Journal).
  useEffect(() => {
    if (segment === "all" && notifications.data?.items.some((n) => !n.readAt)) {
      void api
        .markNotificationsRead()
        .then(() => refreshMe())
        .catch(() => undefined);
    }
  }, [segment, notifications.data, refreshMe]);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const items = conversations.data?.items ?? [];
  const unreadConversations = items.filter((x) => x.unreadCount > 0);
  const requestList = (
    <View style={styles.list}>
      {requestSections.map(({ kind, Section }) => (
        <Section key={kind} refreshKey={refreshKey} onChanged={() => void reloadAll()} />
      ))}
    </View>
  );

  return (
    <View style={styles.fill} testID="inbox-sheet">
      <Stack.Screen
        options={{
          presentation: "transparentModal",
          animation: "fade",
          contentStyle: { backgroundColor: "transparent" },
        }}
      />
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]}
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel="Fermer la Boîte"
      />
      <View
        style={[
          styles.sheet,
          { backgroundColor: c.ground, boxShadow: t.shadow.shadowSheet, paddingBottom: 20 + insets.bottom },
        ]}
        accessibilityViewIsModal
      >
        <View style={[styles.grab, { backgroundColor: c.line }]} />
        <View style={styles.head}>
          <Text variant="posterM" color={c.ink} accessibilityRole="header" style={styles.headTitle}>
            {messagingLabels.inbox}
          </Text>
          <Pressable
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Fermer"
            style={[styles.closex, { backgroundColor: c.surface }]}
            testID="inbox-close"
          >
            <Icon name="close" size={20} color={c.ink} />
          </Pressable>
        </View>
        <Seg
          testID="inbox-segments"
          value={segment}
          onChange={setSegment}
          items={[
            { id: "all", label: total ? `Tout · ${total}` : "Tout", testID: "inbox-all" },
            {
              id: "messages",
              label: unreadMessages ? `${messagingLabels.messages} · ${unreadMessages}` : messagingLabels.messages,
              testID: "inbox-messages",
            },
            {
              id: "requests",
              label: requests ? `${messagingLabels.requests} · ${requests}` : messagingLabels.requests,
              testID: "inbox-requests",
            },
          ]}
        />
        <ScrollView style={styles.scroll} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          {conversations.offline ? <Notice>Hors ligne : dernière liste connue.</Notice> : null}

          {segment === "all" ? (
            <>
              {unreadConversations.map((x) => (
                <ConversationRow key={x.id} c={x} onPress={() => router.push(`/boite/${x.id}`)} />
              ))}
              {requests > 0 ? requestList : null}
              {(notifications.data?.items ?? []).map((n) => (
                <NotificationRow key={n.id} n={n} onLeave={() => undefined} />
              ))}
              {unreadConversations.length === 0 && requests === 0 && (notifications.data?.items.length ?? 0) === 0 ? (
                <Muted variant="body">{notifications.loading ? "Chargement…" : "Rien de neuf pour le moment."}</Muted>
              ) : null}
            </>
          ) : segment === "messages" ? (
            items.length === 0 ? (
              <Muted variant="body">{conversations.loading ? "Chargement…" : messagingLabels.noConversations}</Muted>
            ) : (
              items.map((x) => <ConversationRow key={x.id} c={x} onPress={() => router.push(`/boite/${x.id}`)} />)
            )
          ) : (
            <>
              {requests === 0 ? <Muted variant="body">{messagingLabels.noRequests}</Muted> : null}
              {requestList}
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: "flex-end" },
  // `.sheet` : fond de l'écran, rayon 26 en haut, 90 % de hauteur au plus, padding 10 × 16.
  sheet: {
    maxHeight: "90%",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingTop: 10,
    paddingHorizontal: 16,
    gap: space3,
  },
  grab: { width: 44, height: 5, borderRadius: 3, alignSelf: "center" },
  head: { flexDirection: "row", alignItems: "center", gap: 10 },
  headTitle: { flex: 1, fontSize: 18, lineHeight: 19 },
  closex: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  scroll: { flexGrow: 0 },
  list: { gap: space2 + 2 },
});
