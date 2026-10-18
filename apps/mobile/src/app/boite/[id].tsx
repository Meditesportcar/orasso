// Conversation (lot 18, ARCHITECTURE-SUITE § 3.5) : liste inversée, bulles, image avec visionneuse, « Lu par … » (S9),
// envoi avec un `clientId` et nouvel essai tant que l'écran est ouvert (S13, pas de file persistante), message
// supprimé, appui long (Supprimer pour ses messages ; Signaler ceux des autres, lot 32).
import { AppBar, Button, Ground, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import {
  type ConversationView,
  MESSAGE_BODY_MAX,
  type MessagePage,
  type MessageView,
  messagingLabels,
  moderationLabels,
  systemMessageText,
} from "@orasso/shared";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { AppState, FlatList, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrivateImage } from "@/features/boite/PrivateImage";
import { openReport } from "@/features/ReportSheet";
import { api } from "@/lib/api";
import { formatDay, formatHour } from "@/lib/format";
import { ApiRequestError, errorMessage } from "@/lib/http";
import { pickPhotos } from "@/lib/photos";
import { useChannel } from "@/lib/realtime";
import { useSession } from "@/lib/session";
import { AppSheet } from "@/ui/AppSheet";
import { KeyboardSafe } from "@/ui/KeyboardSafe";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";

const { space1, space2, space3, space4 } = tokens.spacing;

type Pending = { clientId: string; body?: string; imageKey?: string; failed: boolean; error?: string };
type Row = { kind: "message"; m: MessageView } | { kind: "pending"; p: Pending };

/** Identifiant unique d'un envoi (idempotence côté API). */
function newClientId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export default function ConversationRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ConversationScreen conversationId={id} />;
}

/**
 * L'écran d'une conversation, réutilisé par la discussion du staff du mode staff (lot 20) : `onClose` remplace le
 * retour à la Boîte, `header` ajoute un encart sous la barre (ex. « en ligne seulement »).
 */
export function ConversationScreen({
  conversationId: id,
  onClose,
  header,
}: {
  conversationId: string;
  onClose?: () => void;
  header?: ReactNode;
}) {
  const { t } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { me } = useSession();
  const myId = me?.user.id ?? "";
  const [conversation, setConversation] = useState<ConversationView | null>(null);
  const [items, setItems] = useState<MessageView[]>([]);
  const [older, setOlder] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [viewer, setViewer] = useState<MessageView | null>(null);
  const [menu, setMenu] = useState<MessageView | null>(null);
  const lastRead = useRef<string | null>(null);

  const close = onClose ?? (() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/boite")));
  const mySide = useCallback(
    (m: MessageView) => (conversation?.side === "structure" ? m.asStructure : m.sender?.userId === myId),
    [conversation?.side, myId],
  );

  const load = useCallback(async () => {
    try {
      const [c, page] = await Promise.all([api.conversation(id), api.messages(id)]);
      setConversation(c);
      setItems(page.items);
      setOlder(page.nextCursor);
      setLoadError(null);
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useChannel(`conversation:${id}`, (event) => {
    if (event.type === "message.new") {
      const m = (event.payload as { message: MessageView }).message;
      const own = m.sender?.userId === myId;
      setItems((list) =>
        list.some((x) => x.id === m.id) ? list : [{ ...m, mine: own, readBy: mySide(m) ? [] : null }, ...list],
      );
      if (m.clientId) setPending((list) => list.filter((p) => p.clientId !== m.clientId));
    } else if (event.type === "message.read") {
      const r = event.payload as { userId: string; pseudo: string; lastReadMessageId: string };
      if (r.userId === myId) return;
      setItems((list) => {
        const at = list.findIndex((m) => m.id === r.lastReadMessageId);
        if (at < 0) return list;
        // Liste du plus récent au plus ancien : tout ce qui est à partir de `at` est lu.
        return list.map((m, i) =>
          i >= at && m.readBy && !m.readBy.some((x) => x.userId === r.userId) && m.sender?.userId !== r.userId
            ? { ...m, readBy: [...m.readBy, { userId: r.userId, pseudo: r.pseudo }] }
            : m,
        );
      });
    } else if (event.type === "message.deleted") {
      const { messageId } = event.payload as { messageId: string };
      setItems((list) => list.map((m) => (m.id === messageId ? { ...m, deleted: true, body: null, image: null } : m)));
    }
  });

  // Lecture confirmée : le dernier message de l'autre côté, quand l'appli est au premier plan.
  useEffect(() => {
    const last = items.find((m) => !mySide(m));
    if (!last || lastRead.current === last.id || !conversation) return;
    const mark = () => {
      if (AppState.currentState !== "active" || lastRead.current === last.id) return;
      lastRead.current = last.id;
      api.markRead(id, last.id).catch(() => {
        lastRead.current = null;
      });
    };
    mark();
    const sub = AppState.addEventListener("change", mark);
    return () => sub.remove();
  }, [items, id, mySide, conversation]);

  const deliver = useCallback(
    async (p: Pending) => {
      try {
        const sent = await api.sendMessage(
          id,
          p.imageKey ? { clientId: p.clientId, imageKey: p.imageKey } : { clientId: p.clientId, body: p.body },
        );
        setItems((list) => (list.some((x) => x.id === sent.id) ? list : [{ ...sent, readBy: [] }, ...list]));
        setPending((list) => list.filter((x) => x.clientId !== p.clientId));
      } catch (e) {
        const network = e instanceof ApiRequestError && (e.isNetwork || e.status >= 500);
        setPending((list) =>
          list.map((x) =>
            x.clientId === p.clientId ? { ...x, failed: true, error: network ? undefined : errorMessage(e) } : x,
          ),
        );
      }
    },
    [id],
  );

  // S13 : nouvel essai toutes les 3 s tant que l'écran est ouvert (même clientId : publié une seule fois).
  useEffect(() => {
    const retry = pending.filter((p) => p.failed && !p.error);
    if (!retry.length) return;
    const timer = setTimeout(() => {
      for (const p of retry) void deliver(p);
    }, 3000);
    return () => clearTimeout(timer);
  }, [pending, deliver]);

  const queue = (p: Omit<Pending, "failed">) => {
    const item = { ...p, failed: false };
    setPending((list) => [item, ...list]);
    void deliver(item);
  };

  const sendText = () => {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    queue({ clientId: newClientId(), body });
  };

  const sendPhoto = async () => {
    setError(null);
    const [photo] = await pickPhotos(1);
    if (!photo) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("purpose", "message");
      if (Platform.OS === "web") {
        const blob = await (await fetch(photo.uri)).blob();
        form.append("file", new File([blob], "photo.jpg", { type: "image/jpeg" }));
      } else {
        form.append("file", { uri: photo.uri, name: "photo.jpg", type: "image/jpeg" } as unknown as Blob);
      }
      const { key } = await api.upload(form);
      queue({ clientId: newClientId(), imageKey: key });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const remove = async (m: MessageView) => {
    setMenu(null);
    try {
      await api.deleteMessage(m.id);
      setItems((list) => list.map((x) => (x.id === m.id ? { ...x, deleted: true, body: null, image: null } : x)));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const loadOlder = async () => {
    if (!older) return;
    try {
      const page: MessagePage = await api.messages(id, older);
      setItems((list) => [...list, ...page.items]);
      setOlder(page.nextCursor);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const lastReadMine = items.find((m) => mySide(m) && m.readBy && m.readBy.length > 0);
  const label = (m: MessageView) => {
    const pseudo = m.sender?.pseudo ?? messagingLabels.deletedAccount;
    return m.asStructure ? messagingLabels.byPseudo(conversation?.structure?.name ?? "", pseudo) : pseudo;
  };
  const rows: Row[] = [
    ...pending.map((p) => ({ kind: "pending" as const, p })),
    ...items.map((m) => ({ kind: "message" as const, m })),
  ];
  const blocked = conversation?.writeBlocked ? messagingLabels.writeBlocked[conversation.writeBlocked] : null;

  const renderRow = ({ item, index }: { item: Row; index: number }) => {
    if (item.kind === "pending") {
      return (
        <View style={[styles.item, styles.itemMine]} testID="message-pending">
          <View
            style={[styles.bubble, { backgroundColor: t.color.plate, borderColor: t.color.plateEdge, opacity: 0.6 }]}
          >
            <Text variant="body" color={t.color.plateInk}>
              {item.p.body ?? messagingLabels.photo}
            </Text>
          </View>
          <Muted variant="caption">
            {item.p.error ?? (item.p.failed ? messagingLabels.notSent : messagingLabels.sending)}
          </Muted>
        </View>
      );
    }
    const m = item.m;
    const mine = mySide(m);
    // Le suivant dans la liste inversée est le message précédent dans le temps.
    const next = rows[index + 1];
    const prev = next?.kind === "message" ? next.m : null;
    const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
    // Message d'information (« Léa a rejoint le crew. », lot 19) : centré, sans bulle ni expéditeur.
    if (m.kind === "system") {
      return (
        <View style={styles.system} testID="message-system">
          {newDay ? (
            <Muted variant="caption" style={styles.day}>
              {formatDay(m.createdAt)}
            </Muted>
          ) : null}
          <Muted variant="caption">{systemMessageText(m.body)}</Muted>
        </View>
      );
    }
    const showName =
      (!mine || (m.asStructure && conversation?.side === "structure")) &&
      (newDay || prev?.sender?.userId !== m.sender?.userId);
    const imageWidth = Math.min(width * 0.6, 260);
    const imageHeight = m.image?.width && m.image.height ? imageWidth * (m.image.height / m.image.width) : imageWidth;
    return (
      <View style={[styles.item, mine && styles.itemMine]} testID="message">
        {newDay ? (
          <Muted variant="caption" style={styles.day}>
            {formatDay(m.createdAt)}
          </Muted>
        ) : null}
        {showName ? <Muted variant="caption">{label(m)}</Muted> : null}
        <Pressable
          onLongPress={() => setMenu(m)}
          onPress={() => (m.image && !m.deleted ? setViewer(m) : undefined)}
          accessibilityHint="Appui long : options du message"
          style={[
            styles.bubble,
            mine
              ? { backgroundColor: t.color.plate, borderColor: t.color.plateEdge }
              : { backgroundColor: t.color.surfaceRaised, borderColor: t.color.line },
          ]}
        >
          {m.deleted ? (
            <Text variant="body" color={mine ? t.color.plateMuted : t.color.inkMuted}>
              {m.moderated ? moderationLabels.messageRemoved : messagingLabels.deleted}
            </Text>
          ) : m.image ? (
            <PrivateImage
              url={m.image.url}
              style={{ width: imageWidth, height: imageHeight, borderRadius: tokens.radius.radiusSm }}
              accessibilityLabel={messagingLabels.photo}
            />
          ) : (
            <Text variant="body" color={mine ? t.color.plateInk : t.color.ink}>
              {m.body}
            </Text>
          )}
        </Pressable>
        <Muted variant="caption">{formatHour(m.createdAt)}</Muted>
        {lastReadMine?.id === m.id ? (
          <Muted variant="caption" testID="read-by">
            {messagingLabels.readBy((m.readBy ?? []).map((r) => r.pseudo))}
          </Muted>
        ) : null}
      </View>
    );
  };

  return (
    <Ground style={styles.fill}>
      <AppBar
        kind="flow"
        title={conversation?.title ?? messagingLabels.inbox}
        facts={conversation?.subtitle ?? undefined}
        onClose={close}
        safeTop={insets.top}
      />
      <KeyboardSafe style={styles.fill}>
        {header ? <View style={styles.pad}>{header}</View> : null}
        {loadError ? (
          <View style={styles.pad}>
            <Notice tone="error">{loadError}</Notice>
          </View>
        ) : null}
        {conversation?.otherUser ? (
          <View style={styles.pad}>
            <Button
              variant="secondary"
              icon="profile"
              onPress={() => router.push(`/u/${encodeURIComponent(conversation.otherUser?.pseudo ?? "")}`)}
            >
              {messagingLabels.viewProfile}
            </Button>
          </View>
        ) : null}
        <FlatList
          inverted
          data={rows}
          keyExtractor={(r) => (r.kind === "message" ? r.m.id : r.p.clientId)}
          renderItem={renderRow}
          contentContainerStyle={styles.list}
          onEndReached={() => void loadOlder()}
          onEndReachedThreshold={0.2}
          keyboardShouldPersistTaps="handled"
          testID="messages"
        />
        {error ? (
          <View style={styles.pad}>
            <Notice tone="error">{error}</Notice>
          </View>
        ) : null}
        <View style={[styles.composer, { paddingBottom: space3 + insets.bottom }]}>
          {blocked ? (
            <Notice>{blocked}</Notice>
          ) : (
            <>
              <TextField
                label={messagingLabels.placeholder}
                value={draft}
                onChangeText={setDraft}
                multiline
                maxLength={MESSAGE_BODY_MAX}
                style={styles.field}
                testID="message-body"
              />
              <View style={styles.row}>
                <Button variant="secondary" icon="add" loading={uploading} onPress={() => void sendPhoto()}>
                  {messagingLabels.photo}
                </Button>
                <Button variant="primary" icon="next" disabled={!draft.trim()} onPress={sendText} testID="message-send">
                  {messagingLabels.send}
                </Button>
              </View>
            </>
          )}
        </View>
      </KeyboardSafe>

      <AppSheet visible={menu !== null} onClose={() => setMenu(null)} accessibilityLabel="Options du message">
        {menu && menu.sender?.userId === myId && !menu.deleted ? (
          <Button variant="secondary" icon="close" fullWidth onPress={() => void remove(menu)}>
            {messagingLabels.deleteMessage}
          </Button>
        ) : null}
        {menu?.sender && menu.sender.userId !== myId && !menu.deleted ? (
          // Signaler (lot 32) : la copie des 5 messages avant et après est faite par l'API.
          <Button
            variant="secondary"
            icon="flag"
            fullWidth
            testID="message-report"
            onPress={() => {
              const id = menu.id;
              setMenu(null);
              openReport({ type: "message", id });
            }}
          >
            {messagingLabels.report}
          </Button>
        ) : null}
      </AppSheet>

      <Modal visible={viewer !== null} animationType="fade" statusBarTranslucent onRequestClose={() => setViewer(null)}>
        <View style={[styles.viewer, { backgroundColor: t.color.groundDeep }]}>
          {viewer?.image ? (
            <PrivateImage
              url={viewer.image.url}
              style={{ width, height: height * 0.8 }}
              accessibilityLabel={messagingLabels.photo}
            />
          ) : null}
          <View style={[styles.viewerBar, { top: insets.top + space3 }]}>
            <Button variant="close" label={messagingLabels.closeImage} onPhoto onPress={() => setViewer(null)} />
          </View>
        </View>
      </Modal>
    </Ground>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pad: { paddingHorizontal: space4, paddingTop: space2 },
  list: { paddingHorizontal: space4, paddingVertical: space3, gap: space2 },
  item: { alignItems: "flex-start", gap: space1 },
  itemMine: { alignItems: "flex-end" },
  day: { alignSelf: "center", marginVertical: space2 },
  system: { alignItems: "center", gap: space1, paddingVertical: space1 },
  bubble: {
    maxWidth: "82%",
    paddingHorizontal: space3,
    paddingVertical: space2,
    borderWidth: 1.5,
    borderRadius: tokens.radius.radiusMd,
  },
  composer: { paddingHorizontal: space4, paddingTop: space2, gap: space2 },
  field: { minHeight: 48, maxHeight: 140 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space2, justifyContent: "flex-end" },
  viewer: { flex: 1, alignItems: "center", justifyContent: "center" },
  viewerBar: { position: "absolute", right: space3 },
});
