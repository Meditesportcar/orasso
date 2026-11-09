// Messages, derrière la bulle (lot R7c2, D38 ; maquette R7.3 `n-msg`) : seulement des conversations (privées, crews,
// organisateurs d'un événement où tu vas, réponses à tes stories), jamais une notification. En tête la ligne « Demandes de
// message · N » (la règle de contact de R6 : directe si la personne te suit, sinon en demande), puis une carte de
// conversations. Étiquettes : « Organisateur », « Crew », « Staff » ; « Réponse à ta story » avec la vignette de la story
// (l'API ne la sert que tant que la story existe ; elle est rendue par `PrivateImage`). Mise à jour en direct par le
// canal `user:{id}`. Une panne n'est pas une liste vide.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type ConversationSummary,
  conversationTag,
  messageRowCount,
  messagingLabels,
  requestRowShown,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { SkewTag, SmallButton } from "@/features/sorties/bits";
import { api } from "@/lib/api";
import { formatDay, formatHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { useChannel } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { useTail } from "@/lib/tailPages";
import { useApi } from "@/lib/useApi";
import { Avatar } from "@/ui/Avatar";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";

import { Count } from "./CapRow";
import { PrivateImage } from "./PrivateImage";

const { space2, space3 } = tokens.spacing;

const whenOf = (iso: string) =>
  new Date(iso).toDateString() === new Date().toDateString() ? formatHour(iso) : formatDay(iso);

function ConversationRow({ c, onPress }: { c: ConversationSummary; onPress: () => void }) {
  const { t } = useTheme();
  const col = t.color;
  const tag = conversationTag(c);
  const unread = c.unreadCount > 0;
  const preview = c.lastMessage ? `${c.lastMessage.mine ? "Toi : " : ""}${c.lastMessage.preview}` : null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityLabel={`${c.title}${tag ? `, ${tag}` : ""}${unread ? `, ${c.unreadCount} non lu${c.unreadCount > 1 ? "s" : ""}` : ""}`}
      style={styles.row}
      testID="conversation-row"
    >
      <Avatar url={c.avatarUrl} pseudo={c.title} size={44} />
      <View style={styles.text}>
        <View style={styles.nameLine}>
          <Text variant="bodyStrong" color={col.ink} style={styles.name}>
            {c.title}
          </Text>
          {tag ? <SkewTag tone="line">{tag}</SkewTag> : null}
        </View>
        {c.subtitle ? (
          <Text variant="caption" color={col.inkMuted}>
            {c.subtitle}
          </Text>
        ) : null}
        {preview ? (
          <Text variant={unread ? "bodyStrong" : "caption"} color={unread ? col.ink : col.inkMuted} numberOfLines={2}>
            {preview}
          </Text>
        ) : null}
      </View>
      <View style={styles.side}>
        {c.lastMessage ? (
          <Text variant="caption" color={col.inkMuted}>
            {whenOf(c.lastMessage.at)}
          </Text>
        ) : null}
        {unread ? <Count n={c.unreadCount} /> : null}
        {c.storyThumbUrl ? (
          <PrivateImage url={c.storyThumbUrl} style={styles.thumb} accessibilityLabel={messagingLabels.tagStoryReply} />
        ) : null}
      </View>
    </Pressable>
  );
}

export function MessagesScreen() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { me, refreshMe } = useSession();
  const conversations = useApi(() => api.conversations(), []);
  const summary = useApi(() => api.inboxSummary(), []);
  const contacts = useApi(() => api.contactRequests(), []);
  const [query, setQuery] = useState("");
  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));

  const reloadAll = useCallback(async () => {
    await Promise.all([conversations.reload(), summary.reload(), contacts.reload(), refreshMe()]);
  }, [conversations.reload, summary.reload, contacts.reload, refreshMe]);
  useChannel(me ? `user:${me.user.id}` : null, (event) => {
    if (event.type === "conversation.updated" || event.type === "inbox.changed" || event.type === "notification") {
      void reloadAll();
    }
  });

  const page = conversations.data;
  // Les pages suivantes : chaque première page relue les oublie, une réponse dépassée est rejetée (tour 2).
  const fetchMore = useCallback((cursor: string) => api.conversations(cursor), []);
  const tail = useTail<ConversationSummary>(page, page?.nextCursor ?? null, fetchMore, errorMessage);
  const nextCursor = tail.nextCursor;
  const all = useMemo(() => [...(page?.items ?? []), ...tail.items], [page, tail.items]);
  const needle = query.trim().toLowerCase();
  const items = needle
    ? all.filter((x) =>
        [x.title, x.subtitle ?? "", ...x.participants, x.lastMessage?.preview ?? ""].some((s) =>
          s.toLowerCase().includes(needle),
        ),
      )
    : all;
  const incoming = (contacts.data?.items ?? []).filter((r) => r.direction === "in");
  // Résumé en panne : le nombre se lit dans la liste des demandes ; sans l'un ni l'autre il est **inconnu** (ni zéro, ni
  // « Rien ») : la ligne reste, sans nombre, avec « Réessayer » (tour 2), mais **seulement après l'échec des deux lectures** ;
  // avant la première réponse la ligne attend, sans message d'erreur (tour 3).
  const { count: messageRequests, status: requestsStatus } = messageRowCount(
    summary.data,
    contacts.data ? incoming.length : null,
    { summary: Boolean(summary.error), list: Boolean(contacts.error) },
  );
  const countFailed = requestsStatus === "failed";

  return (
    <FlowScreen title="Messages" facts="Tes conversations" onClose={close} closeLabel="Retour" onRefresh={reloadAll}>
      {conversations.error && !page ? (
        <LoadError message={conversations.error.message} onRetry={() => void conversations.reload()} />
      ) : null}
      {conversations.offline ? <Notice>Hors ligne : dernière liste connue.</Notice> : null}

      <View style={[styles.search, { backgroundColor: c.surface, borderColor: c.line }]}>
        <Icon name="search" size={20} color={c.inkMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Chercher une conversation"
          placeholderTextColor={c.inkMuted}
          accessibilityLabel="Chercher une conversation"
          style={[styles.input, { color: c.ink }]}
          testID="messages-search"
        />
      </View>

      {countFailed ? (
        <LoadError
          message="Le nombre de demandes de message n'a pas pu être lu."
          onRetry={() => void Promise.all([summary.reload(), contacts.reload()])}
        />
      ) : null}
      {requestRowShown(messageRequests, requestsStatus) ? (
        <Pressable
          onPress={() => router.push("/messages/demandes")}
          accessibilityRole="link"
          accessibilityLabel={
            messageRequests === null
              ? messagingLabels.messageRequests
              : `${messagingLabels.messageRequests}, ${messageRequests} en attente`
          }
          style={[styles.requestsRow, { backgroundColor: c.surface }]}
          testID="messages-requests-row"
        >
          <View style={[styles.mail, { backgroundColor: c.surfaceRaised }]}>
            <Icon name="chat" size={20} color={c.ink} />
          </View>
          <View style={styles.text}>
            <Text variant="bodyStrong" color={c.ink}>
              {messageRequests === null
                ? messagingLabels.messageRequests
                : `${messagingLabels.messageRequests} · ${messageRequests}`}
            </Text>
            {incoming.length > 0 ? (
              <Text variant="caption" color={c.inkMuted} numberOfLines={2}>
                {incoming
                  .slice(0, 2)
                  .map((r) => r.person.pseudo)
                  .join(", ")}
              </Text>
            ) : null}
          </View>
          <Icon name="next" size={20} color={c.ink} />
        </Pressable>
      ) : null}

      {items.length > 0 ? (
        <View style={[styles.card, { backgroundColor: c.surface }]} testID="conversation-list">
          {items.map((x, i) => (
            <View key={x.id} style={i > 0 ? [styles.divider, { borderTopColor: c.line }] : null}>
              <ConversationRow c={x} onPress={() => router.push(`/messages/${x.id}`)} />
            </View>
          ))}
        </View>
      ) : page ? (
        <Muted variant="body">{needle ? "Aucune conversation ne correspond." : messagingLabels.noConversations}</Muted>
      ) : conversations.loading ? (
        <Muted variant="body">Chargement…</Muted>
      ) : null}
      {tail.error ? <Notice tone="error">{tail.error}</Notice> : null}
      {nextCursor ? (
        <SmallButton icon="down" disabled={tail.busy} onPress={() => void tail.more()} testID="messages-more">
          Voir plus
        </SmallButton>
      ) : null}
      <Muted variant="caption" style={styles.note}>
        Privées, crews, organisateurs d'un événement où tu vas, réponses à tes stories. Aucune notification ici.
      </Muted>
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: space2,
    paddingHorizontal: space3,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 48,
  },
  input: { flex: 1, fontSize: 16, paddingVertical: 10 },
  requestsRow: { flexDirection: "row", alignItems: "center", gap: space3, padding: space3, borderRadius: 16 },
  mail: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  card: { borderRadius: 16, overflow: "hidden" },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
  row: { flexDirection: "row", alignItems: "center", gap: space3, padding: space3 },
  text: { flex: 1, gap: 2 },
  nameLine: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space2 },
  name: { fontWeight: "800" },
  side: { alignItems: "flex-end", gap: 6 },
  thumb: { width: 36, height: 44, borderRadius: 8 },
  note: { paddingTop: space2 },
});
