// « Messages · <structure> » (lot R9d, maquette R9.4 `n-cloche`, à l'adresse `/messages/orga`, T29) : la bulle de la casquette
// organisateur, que des conversations. Chips « Tout · Participants · Équipe » ; une liste unique triée par date : les
// conversations des participants, les messages groupés envoyés (une ligne « Message groupé · … » par envoi) et les
// discussions de staff (la permanente et celles des événements), chacune avec son non-lu. Bouton principal collant
// « Nouveau message » (T30). Les demandes de staff vivent dans la cloche (Activité) ; les modèles se retrouvent depuis le message groupé.
import { Button, Chip, ChipRow, Plate, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type ConversationSummary,
  communicationLabels,
  type GroupMessageView,
  structureActivityLabels as L,
  messageSegmentLabels,
  orgaManageLabels,
  type StaffConversationState,
} from "@orasso/shared";
import { useIsFocused, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { api } from "@/lib/api";
import { withReturn } from "@/lib/closeTo";
import { formatDay, formatDayHour, formatHour } from "@/lib/format";
import { useChannel } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { Avatar } from "@/ui/Avatar";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";
import { GroupMessageSheet } from "./GroupMessageSheet";
import { NewMessageSheet } from "./NewMessageSheet";
import { OrgaFailure, useOrga } from "./OrgaGate";

const { space1, space2, space3 } = tokens.spacing;

type Segment = "all" | "participants" | "team";

const whenOf = (iso: string) =>
  new Date(iso).toDateString() === new Date().toDateString() ? formatHour(iso) : formatDay(iso);

/** Une ligne de la liste unique : sa date de tri, sa sorte et ce qu'elle montre. */
type Line =
  | { key: string; at: number; kind: "participant"; c: ConversationSummary }
  | { key: string; at: number; kind: "group"; m: GroupMessageView }
  | { key: string; at: number; kind: "staff"; chat: StaffConversationState };

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

/** « Message groupé · inscrits du Lydia » : un envoi, avec le nombre de destinataires et de lectures. */
function GroupRow({ m }: { m: GroupMessageView }) {
  const { t } = useTheme();
  const c = t.color;
  const audience = `${messageSegmentLabels[m.segment]}${m.event ? ` · ${m.event.title}` : ""}`;
  // Le texte entier se lit en touchant la carte (l'ancien écran l'affichait sans limite) ; refermée, trois lignes.
  const [open, setOpen] = useState(false);
  return (
    <Pressable
      onPress={() => setOpen((v) => !v)}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={L.groupedLine(audience)}
    >
      <Plate style={styles.block} testID="orga-group-row">
        <Text variant="label" color={c.plateMuted}>
          {L.groupedLine(audience)} · {formatDayHour(m.sentAt ?? m.createdAt)}
        </Text>
        {m.subject ? (
          <Text variant="bodyStrong" color={c.plateInk}>
            {m.subject}
          </Text>
        ) : null}
        <Text variant="body" color={c.plateInk} numberOfLines={open ? undefined : 3}>
          {m.body}
        </Text>
        <Text variant="caption" color={c.plateMuted}>
          {m.status === "sent"
            ? `${communicationLabels.groupRecipients(m.recipientsCount)} · ${communicationLabels.groupRead(m.readCount)}`
            : communicationLabels.groupSending}
        </Text>
      </Plate>
    </Pressable>
  );
}

function StaffChatRow({ chat, onOpen }: { chat: StaffConversationState; onOpen: () => void }) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <Pressable onPress={onOpen} accessibilityRole="link" accessibilityLabel={chat.title} testID="orga-staff-chat">
      <Plate style={styles.block}>
        <View style={styles.rowHead}>
          <Text variant="bodyStrong" color={c.plateInk} style={styles.grow}>
            {`${L.staffDiscussion} · ${chat.title}`}
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
      </Plate>
    </Pressable>
  );
}

export function StructureMessagesScreen() {
  const router = useRouter();
  const focused = useIsFocused();
  const { me, refreshMe } = useSession();
  const { structureId, structureName } = useOrga();
  const at = useNow(60_000);
  const [segment, setSegment] = useState<Segment>("all");
  const [choosing, setChoosing] = useState(false);
  const [composing, setComposing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const summary = useApi(() => api.orgInboxSummary(structureId), [structureId]);
  const conversations = useApi(() => api.orgConversations(structureId), [structureId]);
  const groups = useApi(() => api.groupMessages(structureId), [structureId]);
  const permanent = useApi(() => api.permanentStaffChat(structureId), [structureId]);
  const chats = useApi(() => api.eventStaffChats(structureId), [structureId]);
  const events = useApi(() => api.structureEvents(structureId), [structureId], {
    cacheKey: `orga-events-${structureId}`,
    enabled: composing,
  });

  const reloadAll = useCallback(async () => {
    await Promise.all([
      summary.reload(),
      conversations.reload(),
      groups.reload(),
      permanent.reload(),
      chats.reload(),
      refreshMe(),
    ]);
  }, [summary.reload, conversations.reload, groups.reload, permanent.reload, chats.reload, refreshMe]);

  // Les nouveaux messages arrivent par le canal du compte, seulement écran affiché.
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
  const staffChats = useMemo(
    () => [...(permanent.data ? [permanent.data] : []), ...(chats.data?.items ?? [])],
    [permanent.data, chats.data],
  );

  // Une liste unique triée par date, la plus récente d'abord.
  const lines = useMemo(() => {
    const out: Line[] = [];
    if (segment !== "team") {
      for (const c of conversations.data?.items ?? []) {
        out.push({ key: `c:${c.id}`, at: c.lastMessage ? Date.parse(c.lastMessage.at) : 0, kind: "participant", c });
      }
      for (const m of groups.data?.items ?? []) {
        out.push({ key: `g:${m.id}`, at: Date.parse(m.sentAt ?? m.createdAt), kind: "group", m });
      }
    }
    if (segment !== "participants") {
      for (const chat of staffChats) {
        out.push({
          key: `s:${chat.conversationId}`,
          at: chat.lastMessageAt ? Date.parse(chat.lastMessageAt) : 0,
          kind: "staff",
          chat,
        });
      }
    }
    return out.sort((a, b) => b.at - a.at);
  }, [segment, conversations.data, groups.data, staffChats]);

  const s = summary.data;
  const chipLabel = (label: string, n: number | undefined) => (n ? `${label} · ${n}` : label);
  const failure = summary.error ?? conversations.error ?? groups.error ?? chats.error;
  const loading = conversations.loading || groups.loading || chats.loading;

  return (
    // Hors de la barre d'onglets : mode B (en-tête de fiche, ✕ pour revenir). Le bouton principal reste collé en bas.
    <FlowScreen
      title={L.messagesTitle}
      facts={structureName}
      onClose={() => (router.canGoBack() ? router.back() : router.replace("/(orga)/direct"))}
      onRefresh={reloadAll}
      footer={
        <Button variant="primary" icon="send" onPress={() => setChoosing(true)} fullWidth testID="orga-new-message">
          {L.newMessage}
        </Button>
      }
      overlays={
        <>
          <NewMessageSheet
            visible={choosing}
            onClose={() => setChoosing(false)}
            staffChats={staffChats}
            staffLoading={permanent.loading || chats.loading}
            onGrouped={() => {
              setChoosing(false);
              setNotice(null);
              setComposing(true);
            }}
            onStaff={(conversationId) => {
              setChoosing(false);
              router.push(`/messages/${conversationId}`);
            }}
          />
          <GroupMessageSheet
            structureId={structureId}
            events={writable}
            visible={composing}
            onClose={() => setComposing(false)}
            onSent={(n) => {
              setComposing(false);
              setNotice(communicationLabels.groupSent(n));
              void groups.reload();
            }}
          />
        </>
      }
    >
      <ChipRow accessibilityRole="tablist">
        <Chip accessibilityRole="tab" selected={segment === "all"} onPress={() => setSegment("all")}>
          {L.messageChips.all}
        </Chip>
        <Chip accessibilityRole="tab" selected={segment === "participants"} onPress={() => setSegment("participants")}>
          {chipLabel(L.messageChips.participants, s?.participantMessages)}
        </Chip>
        <Chip accessibilityRole="tab" selected={segment === "team"} onPress={() => setSegment("team")}>
          {chipLabel(L.messageChips.team, s?.staffDiscussions)}
        </Chip>
      </ChipRow>

      <OrgaFailure error={failure} />
      {notice ? <Notice>{notice}</Notice> : null}

      {lines.map((line) =>
        line.kind === "participant" ? (
          <ParticipantRow key={line.key} c={line.c} onPress={() => router.push(`/messages/${line.c.id}`)} />
        ) : line.kind === "group" ? (
          <GroupRow key={line.key} m={line.m} />
        ) : (
          <StaffChatRow
            key={line.key}
            chat={line.chat}
            onOpen={() => router.push(`/messages/${line.chat.conversationId}`)}
          />
        ),
      )}
      {lines.length === 0 ? (
        <Muted variant="body">{loading ? "Chargement…" : "Aucun message pour l'instant."}</Muted>
      ) : null}
      {segment !== "team" ? (
        <Button
          variant="plate"
          icon="chat"
          next
          onPress={() => router.push(withReturn("/modeles", "/messages/orga") as never)}
          fullWidth
          testID="orga-templates-open"
        >
          {orgaManageLabels.templatesOpen}
        </Button>
      ) : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: space3, padding: space3 },
  rowText: { flex: 1, gap: space1 },
  rowHead: { flexDirection: "row", alignItems: "baseline", gap: space2 },
  grow: { flex: 1 },
  block: { gap: space2, padding: space3 },
  count: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: tokens.radius.radiusPill,
    alignItems: "center",
  },
});
