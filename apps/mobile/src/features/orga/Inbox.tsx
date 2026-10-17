// Casquette Organisateur, Boîte (lot 22, ARCHITECTURE-SUITE § 5 et § 7.2) : les messages des participants (conversations
// de la structure), les messages groupés (historique et nouveau message), les discussions du staff, et les demandes pour
// devenir staff. Les réponses se font dans la conversation du lot 18 ; tout est lu depuis l'API de la structure active.
import { Button, Chip, ChipRow, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type ConversationSummary,
  communicationLabels,
  type GroupMessageView,
  messageSegmentLabels,
  orgaLabels,
  orgaManageLabels,
  type StaffConversationState,
} from "@orasso/shared";
import { useIsFocused, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { formatDay, formatDayHour, formatHour } from "@/lib/format";
import { staffRequests } from "@/lib/orga";
import { useChannel } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { Avatar } from "@/ui/Avatar";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { SectionTitle, TabScreen } from "@/ui/Screens";
import { GroupMessageSheet } from "./GroupMessageSheet";
import { OrgaFailure, useOrga } from "./OrgaGate";

const { space1, space2, space3 } = tokens.spacing;

type Segment = "participants" | "groups" | "staff" | "requests";

const whenOf = (iso: string) =>
  new Date(iso).toDateString() === new Date().toDateString() ? formatHour(iso) : formatDay(iso);

function UnreadDot({ n }: { n: number }) {
  const { t } = useTheme();
  if (n <= 0) return null;
  return (
    <View style={[styles.count, { backgroundColor: t.color.accent }]}>
      <Text variant="credit" color={t.color.accentInk}>
        {n}
      </Text>
    </View>
  );
}

function ParticipantRow({ c, onPress }: { c: ConversationSummary; onPress: () => void }) {
  const { t } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={c.title} testID="orga-conversation-row">
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
        <UnreadDot n={c.unreadCount} />
      </Plate>
    </Pressable>
  );
}

function GroupRow({ m }: { m: GroupMessageView }) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Plate style={styles.block} testID="orga-group-row">
      <Text variant="label" color={c.plateMuted}>
        {messageSegmentLabels[m.segment]}
        {m.event ? ` · ${m.event.title}` : ""} · {formatDayHour(m.sentAt ?? m.createdAt)}
      </Text>
      {m.subject ? (
        <Text variant="bodyStrong" color={c.plateInk}>
          {m.subject}
        </Text>
      ) : null}
      <Text variant="body" color={c.plateInk} numberOfLines={3}>
        {m.body}
      </Text>
      <Text variant="caption" color={c.plateMuted}>
        {m.status === "sent"
          ? `${communicationLabels.groupRecipients(m.recipientsCount)} · ${communicationLabels.groupRead(m.readCount)}`
          : communicationLabels.groupSending}
      </Text>
    </Plate>
  );
}

function StaffChatRow({ chat, onOpen }: { chat: StaffConversationState; onOpen: () => void }) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Plate style={styles.block} testID="orga-staff-chat">
      <View style={styles.rowHead}>
        <Text variant="bodyStrong" color={c.plateInk} style={styles.grow}>
          {chat.title}
        </Text>
        <UnreadDot n={chat.unreadCount} />
      </View>
      <Text variant="caption" color={c.plateMuted}>
        {chat.open
          ? communicationLabels.staffOpen
          : chat.closedAt && chat.readableUntil
            ? communicationLabels.staffClosed(formatDay(chat.closedAt), formatDay(chat.readableUntil))
            : "Fermée"}
      </Text>
      <Button variant="plate" icon="chat" onPress={onOpen} fullWidth>
        {orgaLabels.staffPermanentOpen}
      </Button>
    </Plate>
  );
}

export function InboxScreen() {
  const { t } = useTheme();
  const router = useRouter();
  const focused = useIsFocused();
  const { me, refreshMe } = useSession();
  const { structureId, structureName } = useOrga();
  const at = useNow(60_000);
  const [segment, setSegment] = useState<Segment>("participants");
  const [composing, setComposing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const summary = useApi(() => api.orgInboxSummary(structureId), [structureId]);
  const conversations = useApi(() => api.orgConversations(structureId), [structureId], {
    enabled: segment === "participants",
  });
  const groups = useApi(() => api.groupMessages(structureId), [structureId], { enabled: segment === "groups" });
  const permanent = useApi(() => api.permanentStaffChat(structureId), [structureId], { enabled: segment === "staff" });
  const chats = useApi(() => api.eventStaffChats(structureId), [structureId], { enabled: segment === "staff" });
  const members = useApi(() => api.structureMembers(structureId), [structureId], { enabled: segment === "requests" });
  const events = useApi(() => api.structureEvents(structureId), [structureId], {
    cacheKey: `orga-events-${structureId}`,
    enabled: composing,
  });

  const reloadAll = useCallback(async () => {
    await Promise.all([
      summary.reload(),
      segment === "participants" ? conversations.reload() : null,
      segment === "groups" ? groups.reload() : null,
      segment === "staff" ? Promise.all([permanent.reload(), chats.reload()]) : null,
      segment === "requests" ? members.reload() : null,
      refreshMe(),
    ]);
  }, [
    segment,
    summary.reload,
    conversations.reload,
    groups.reload,
    permanent.reload,
    chats.reload,
    members.reload,
    refreshMe,
  ]);

  // Les nouveaux messages arrivent par le canal du compte (comme la Boîte du passionné), seulement onglet affiché.
  useChannel(focused && me ? `user:${me.user.id}` : null, (event) => {
    if (event.type === "conversation.updated" || event.type === "inbox.changed") void reloadAll();
  });

  // Événements à qui on peut écrire : publiés, pas finis depuis plus de 7 jours (l'API le refuse au-delà).
  const writable = useMemo(
    () =>
      (events.data ?? []).filter(
        (e) => e.status === "published" && Date.parse(e.endsAt) > at.getTime() - 7 * 24 * 3600 * 1000,
      ),
    [events.data, at],
  );
  const s = summary.data;
  const requests = staffRequests(members.data ?? []);
  const chipLabel = (label: string, n: number | undefined) => (n ? `${label} · ${n}` : label);
  const failure = summary.error ?? conversations.error ?? groups.error ?? chats.error ?? members.error;

  return (
    <TabScreen
      title={orgaLabels.inboxTitle}
      facts={structureName}
      onRefresh={reloadAll}
      overlays={
        <GroupMessageSheet
          structureId={structureId}
          events={writable}
          visible={composing}
          onClose={() => setComposing(false)}
          onSent={(n) => {
            setComposing(false);
            setNotice(communicationLabels.groupSent(n));
            setSegment("groups");
            void groups.reload();
          }}
        />
      }
    >
      <ChipRow>
        <Chip selected={segment === "participants"} onPress={() => setSegment("participants")}>
          {chipLabel(orgaLabels.segParticipants, s?.participantMessages)}
        </Chip>
        <Chip selected={segment === "groups"} onPress={() => setSegment("groups")}>
          {orgaLabels.segGroups}
        </Chip>
        <Chip selected={segment === "staff"} onPress={() => setSegment("staff")}>
          {chipLabel(orgaLabels.segStaff, s?.staffDiscussions)}
        </Chip>
        <Chip selected={segment === "requests"} onPress={() => setSegment("requests")}>
          {chipLabel(orgaLabels.segRequests, s?.staffRequests)}
        </Chip>
      </ChipRow>

      <OrgaFailure error={failure} />
      {notice ? <Notice>{notice}</Notice> : null}

      {segment === "participants" ? (
        (conversations.data?.items ?? []).length === 0 ? (
          <Muted variant="body">{conversations.loading ? "Chargement…" : orgaLabels.participantsEmpty}</Muted>
        ) : (
          (conversations.data?.items ?? []).map((c) => (
            <ParticipantRow key={c.id} c={c} onPress={() => router.push(`/boite/${c.id}`)} />
          ))
        )
      ) : null}

      {segment === "groups" ? (
        <>
          <Button
            variant="primary"
            icon="add"
            onPress={() => {
              setNotice(null);
              setComposing(true);
            }}
            fullWidth
            testID="orga-group-new"
          >
            {orgaLabels.groupNew}
          </Button>
          {/* Lot 35a : les modèles se créent, se modifient et se suppriment ici (prototype : bouton « Modèles »). */}
          <Button
            variant="plate"
            icon="chat"
            next
            onPress={() => router.push("/modeles")}
            fullWidth
            testID="orga-templates-open"
          >
            {orgaManageLabels.templatesOpen}
          </Button>
          <SectionTitle>{communicationLabels.groupHistory}</SectionTitle>
          {(groups.data?.items ?? []).length === 0 ? (
            <Muted variant="body">{groups.loading ? "Chargement…" : communicationLabels.groupHistoryEmpty}</Muted>
          ) : (
            (groups.data?.items ?? []).map((m) => <GroupRow key={m.id} m={m} />)
          )}
        </>
      ) : null}

      {segment === "staff" ? (
        <>
          <SectionTitle>{communicationLabels.staffPermanent}</SectionTitle>
          {permanent.data ? (
            <StaffChatRow
              chat={permanent.data}
              onOpen={() => router.push(`/boite/${permanent.data?.conversationId}`)}
            />
          ) : (
            <Muted variant="body">{permanent.loading ? "Chargement…" : null}</Muted>
          )}
          <SectionTitle>{communicationLabels.staffByEvent}</SectionTitle>
          {(chats.data?.items ?? []).length === 0 ? (
            <Muted variant="body">{chats.loading ? "Chargement…" : communicationLabels.staffEmpty}</Muted>
          ) : (
            (chats.data?.items ?? []).map((chat) => (
              <StaffChatRow
                key={chat.conversationId}
                chat={chat}
                onOpen={() => router.push(`/boite/${chat.conversationId}`)}
              />
            ))
          )}
        </>
      ) : null}

      {segment === "requests" ? (
        <>
          <SectionTitle>{orgaLabels.staffRequestsTitle}</SectionTitle>
          {requests.length === 0 ? (
            <Muted variant="body">{members.loading ? "Chargement…" : orgaLabels.staffRequestsEmpty}</Muted>
          ) : (
            <>
              <Plate style={styles.block} testID="orga-staff-requests">
                {requests.map((m) => (
                  <Text key={m.userId} variant="bodyStrong" color={t.color.plateInk}>
                    {m.pseudo}
                  </Text>
                ))}
              </Plate>
              <Button
                variant="plate"
                icon="staff"
                next
                onPress={() => router.navigate("/staff")}
                fullWidth
                testID="orga-requests-open-team"
              >
                {orgaManageLabels.requestsOpenTeam}
              </Button>
            </>
          )}
        </>
      ) : null}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: space3, padding: space3 },
  rowText: { flex: 1, gap: space1 },
  rowHead: { flexDirection: "row", alignItems: "baseline", gap: space2 },
  grow: { flex: 1 },
  block: { gap: space2, padding: space3 },
  count: { minWidth: 22, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, alignItems: "center" },
});
