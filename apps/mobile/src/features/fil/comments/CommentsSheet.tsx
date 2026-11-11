// La feuille des commentaires d'une publication (lot R8k2, maquette R8.3 `CMSHEET`) : la liste du plus ancien au plus récent (« Voir plus »),
// les réponses repliées sous leur commentaire, un champ de 300 caractères collé au clavier, « @ » qui propose des pseudos, les
// menus (Supprimer, Signaler, Couper les commentaires). Aucune règle ici : l'API les tient. Elle prend `post` et `onChange(post)`
// et ne suppose pas le Fil.
import { Icon, Sheet, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  caretAfterEdit,
  commentCounter,
  commentIssue,
  commentsTitle,
  type FeedCommentView,
  type FeedPostView,
  insertMention,
  feedCommentScreenLabels as L,
  type MentionDraft,
  mentionQuery,
  repliesLine,
} from "@orasso/shared";
import { useEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  type TextInputSelectionChangeEvent,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SetRow } from "@/features/profil/parts";
import { openReport } from "@/features/ReportSheet";
import { useKeyboardOverlap } from "@/ui/KeyboardSafe";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { Overlay } from "@/ui/Overlay";
import { Waiting } from "@/ui/Waiting";
import { CommentRow } from "./CommentRow";
import { MentionSuggest } from "./MentionSuggest";
import { SheetClose } from "./parts";
import { useComments, useMentionSuggestions } from "./useComments";

const { space2, space3 } = tokens.spacing;

type Menu = { kind: "comment"; comment: FeedCommentView } | { kind: "post" } | null;

export function CommentsSheet({
  post,
  visible,
  focus,
  onClose,
  onChange,
}: {
  post: FeedPostView;
  visible: boolean;
  /** Le bouton « Commenter » a ouvert la feuille : le champ prend la main. */
  focus: boolean;
  onClose: () => void;
  onChange: (post: FeedPostView) => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const ref = useRef<View>(null);
  const keyboard = useKeyboardOverlap(ref);
  const inputRef = useRef<TextInput>(null);
  const ctl = useComments(post, visible, onChange);
  const { sheet } = ctl;
  const [text, setText] = useState("");
  const [sel, setSel] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [forceSel, setForceSel] = useState<{ start: number; end: number } | null>(null);
  const [replyTo, setReplyTo] = useState<{ id: string; pseudo: string } | null>(null);
  const [menu, setMenu] = useState<Menu>(null);

  const draft: MentionDraft | null = visible && !post.commentsOff ? mentionQuery(text, sel.end) : null;
  const suggestions = useMentionSuggestions(post.id, draft);

  // Ouverte par « Commenter » : le champ prend la main une fois la feuille posée.
  useEffect(() => {
    if (!visible) return;
    if (!focus || post.commentsOff) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 380);
    return () => clearTimeout(timer);
  }, [visible, focus, post.commentsOff]);

  function onSelect(e: TextInputSelectionChangeEvent) {
    setSel(e.nativeEvent.selection);
    if (forceSel) setForceSel(null);
  }

  function reply(target: FeedCommentView) {
    const prefix = `@${target.author.pseudo} `;
    setReplyTo({ id: target.id, pseudo: target.author.pseudo });
    setText(prefix);
    setForceSel({ start: prefix.length, end: prefix.length });
    inputRef.current?.focus();
  }

  function pick(pseudo: string) {
    const next = insertMention(text, sel.end, pseudo);
    if (!next) return;
    setText(next.text);
    setSel({ start: next.caret, end: next.caret });
    setForceSel({ start: next.caret, end: next.caret });
  }

  function submit() {
    if (commentIssue(text) !== null || post.commentsOff) return;
    ctl.send(text, replyTo?.id ?? null);
    setText("");
    setReplyTo(null);
    setSel({ start: 0, end: 0 });
  }

  const issue = commentIssue(text);
  const counter = commentCounter(text);
  const bottom = Math.max(insets.bottom, keyboard);
  const items = sheet.items;
  const pendingTop = sheet.pending.filter((p) => p.parentId === null);
  const empty = sheet.loaded && items.length === 0 && pendingTop.length === 0 && !post.commentsOff;

  return (
    <Overlay>
      <Sheet visible={visible} onClose={onClose} accessibilityLabel={L.commentsSheet}>
        <View
          ref={ref}
          style={{ paddingBottom: bottom, maxHeight: Math.max(height * 0.4, height * 0.88 - keyboard) }}
          testID="feed-comments-sheet"
        >
          <View style={styles.head}>
            <Text
              variant="posterM"
              color={c.ink}
              style={styles.title}
              accessibilityRole="header"
              testID="feed-comments-title"
            >
              {commentsTitle(post.commentsCount)}
            </Text>
            {post.mine ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={L.more}
                onPress={() => setMenu({ kind: "post" })}
                hitSlop={6}
                style={[styles.closex, { backgroundColor: c.surface }]}
                testID="feed-comments-menu"
              >
                <Icon name="more" size={20} color={c.ink} />
              </Pressable>
            ) : null}
            <SheetClose onPress={onClose} testID="feed-comments-close" />
          </View>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            testID="feed-comments-list"
          >
            {ctl.gone ? (
              <Notice tone="error" testID="feed-comments-gone">
                {L.goneNotice}
              </Notice>
            ) : ctl.loadError && !sheet.loaded ? (
              <LoadError message={ctl.loadError} onRetry={ctl.retryLoad} />
            ) : !sheet.loaded ? (
              <Waiting blocks={[48, 48, 48]} testID="feed-comments-waiting" />
            ) : empty ? (
              <Muted variant="body" testID="feed-comments-empty">
                {L.empty}
              </Muted>
            ) : null}
            {items.map((m) => {
              const r = sheet.replies[m.id];
              const pendingReplies = sheet.pending.filter((p) => p.parentId === m.id);
              return (
                <View key={m.id} style={styles.item}>
                  <CommentRow
                    comment={m}
                    onFire={ctl.fire}
                    onReply={reply}
                    onMenu={(x) => setMenu({ kind: "comment", comment: x })}
                  />
                  {m.repliesCount > 0 || pendingReplies.length > 0 ? (
                    <View style={styles.repliesWrap}>
                      {m.repliesCount > 0 ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ expanded: Boolean(r?.open) }}
                          onPress={() => ctl.toggleReplies(m.id)}
                          hitSlop={6}
                          style={styles.more}
                          testID="feed-comment-replies-toggle"
                        >
                          <Text variant="bodyStrong" color={c.accentText} style={styles.moreText}>
                            {r?.open ? L.hideReplies : repliesLine(m.repliesCount)}
                          </Text>
                          <Icon name={r?.open ? "up" : "down"} size={14} color={c.accentText} />
                        </Pressable>
                      ) : null}
                      {r?.open ? (
                        <View style={[styles.replies, { borderLeftColor: c.line }]} testID="feed-comment-replies">
                          {r.items.map((x) => (
                            <CommentRow
                              key={x.id}
                              comment={x}
                              reply
                              onFire={ctl.fire}
                              onMenu={(y) => setMenu({ kind: "comment", comment: y })}
                            />
                          ))}
                          {r.cursor ? (
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => ctl.loadMoreReplies(m.id)}
                              style={styles.more}
                              testID="feed-comment-replies-more"
                            >
                              <Text variant="bodyStrong" color={c.accentText} style={styles.moreText}>
                                {L.loadMore}
                              </Text>
                            </Pressable>
                          ) : null}
                          {pendingReplies.map((p) => (
                            <PendingRow key={p.clientId} p={p} onRetry={ctl.retry} />
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              );
            })}
            {sheet.cursor ? (
              <Pressable
                accessibilityRole="button"
                onPress={ctl.loadMore}
                style={styles.more}
                testID="feed-comments-more"
              >
                <Text variant="bodyStrong" color={c.accentText} style={styles.moreText}>
                  {L.loadMore}
                </Text>
                <Icon name="down" size={14} color={c.accentText} />
              </Pressable>
            ) : null}
            {ctl.loadError && sheet.loaded ? <LoadError message={ctl.loadError} onRetry={ctl.retryLoad} /> : null}
            {pendingTop.map((p) => (
              <PendingRow key={p.clientId} p={p} onRetry={ctl.retry} />
            ))}
            {ctl.actionError ? <Notice tone="error">{ctl.actionError}</Notice> : null}
          </ScrollView>
          {ctl.gone ? null : post.commentsOff ? (
            <Muted variant="body" style={styles.off} testID="feed-comments-off">
              {L.off}
            </Muted>
          ) : (
            <View style={styles.composer}>
              <MentionSuggest items={suggestions} onPick={pick} />
              {replyTo ? (
                <View style={styles.replyto} testID="feed-comment-replyto">
                  <Icon name="chat" size={15} color={c.inkMuted} />
                  <Text variant="bodyStrong" color={c.inkMuted} style={styles.replytoText}>
                    {L.replyingTo(replyTo.pseudo)}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={L.cancelReply}
                    onPress={() => {
                      setReplyTo(null);
                      setText("");
                    }}
                    style={styles.replytoX}
                    testID="feed-comment-replyto-cancel"
                  >
                    <Icon name="close" size={16} color={c.ink} />
                  </Pressable>
                </View>
              ) : null}
              <View style={styles.inputRow}>
                <TextInput
                  ref={inputRef}
                  value={text}
                  onChangeText={(value) => {
                    setSel((was) => {
                      const at = caretAfterEdit(text, value);
                      return was.start === was.end && was.end === at ? was : { start: at, end: at };
                    });
                    setText(value);
                  }}
                  onSelectionChange={onSelect}
                  selection={forceSel ?? undefined}
                  maxLength={300}
                  placeholder={replyTo ? L.replyPlaceholder : L.placeholder}
                  placeholderTextColor={c.inkFaint}
                  accessibilityLabel={L.inputLabel}
                  selectionColor={c.accent}
                  returnKeyType="send"
                  blurOnSubmit={false}
                  onSubmitEditing={submit}
                  style={[styles.input, { color: c.ink, backgroundColor: c.surface, borderColor: c.line }]}
                  testID="feed-comment-input"
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={L.send}
                  accessibilityState={{ disabled: issue !== null }}
                  disabled={issue !== null}
                  onPress={submit}
                  style={[
                    styles.send,
                    { backgroundColor: c.surface, borderColor: c.line },
                    issue !== null && styles.sendOff,
                  ]}
                  testID="feed-comment-send"
                >
                  <Icon name="send" size={18} color={c.ink} />
                </Pressable>
              </View>
              {counter.shown ? (
                <Text variant="caption" color={c.inkMuted} style={styles.counter} testID="feed-comment-counter">
                  {L.counter(counter.length, counter.max)}
                </Text>
              ) : null}
            </View>
          )}
        </View>
      </Sheet>
      <Sheet visible={menu !== null} onClose={() => setMenu(null)} accessibilityLabel={L.more}>
        {menu ? (
          <View style={{ paddingBottom: insets.bottom, gap: space3 }}>
            <View style={styles.head}>
              <Text variant="posterM" color={c.ink} style={styles.title} accessibilityRole="header">
                {menu.kind === "post" ? L.commentsSheet : menu.comment.author.pseudo}
              </Text>
              <SheetClose onPress={() => setMenu(null)} testID="feed-comment-menu-close" />
            </View>
            <View style={[styles.menu, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}>
              {menu.kind === "post" ? (
                <SetRow
                  first
                  icon={post.commentsOff ? "undo" : "close"}
                  title={post.commentsOff ? L.commentsOn : L.commentsOff}
                  caption={post.commentsOff ? L.commentsOnHint : L.commentsOffHint}
                  tone={post.commentsOff ? undefined : "out"}
                  onPress={() => {
                    setMenu(null);
                    void ctl.setOff(!post.commentsOff);
                  }}
                  testID="feed-comments-toggle-off"
                />
              ) : (
                <>
                  {menu.comment.mine || menu.comment.canDelete ? (
                    <SetRow
                      first
                      icon="trash"
                      title={L.deleteComment}
                      tone="out"
                      onPress={() => {
                        const target = menu.comment;
                        setMenu(null);
                        void ctl.remove(target);
                      }}
                      testID="feed-comment-delete"
                    />
                  ) : null}
                  {menu.comment.mine ? null : (
                    <SetRow
                      first={!menu.comment.canDelete}
                      icon="flag"
                      title={L.reportComment}
                      tone="out"
                      onPress={() => {
                        const target = menu.comment;
                        setMenu(null);
                        openReport({ type: "feed_comment", id: target.id });
                      }}
                      testID="feed-comment-report"
                    />
                  )}
                </>
              )}
            </View>
          </View>
        ) : null}
      </Sheet>
    </Overlay>
  );
}

/** Un envoi en attente : la ligne apparaît tout de suite, grisée ; en échec elle dit « Non envoyé » avec « Réessayer ». */
function PendingRow({
  p,
  onRetry,
}: {
  p: { clientId: string; text: string; status: "sending" | "failed"; error: string | null };
  onRetry: (clientId: string) => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  return (
    <View style={[styles.pending, p.status === "sending" && styles.sending]} testID="feed-comment-pending">
      <Text variant="body" color={c.ink} style={styles.pendingText}>
        {p.text}
      </Text>
      {p.status === "failed" ? (
        <View style={styles.failed}>
          <Icon name="alert" size={15} color={c.winText} />
          <Text
            variant="caption"
            color={c.winText}
            style={styles.failedText}
            accessibilityRole="alert"
            testID="feed-comment-notsent"
          >
            {L.notSent}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => onRetry(p.clientId)}
            hitSlop={6}
            style={styles.retry}
            testID="feed-comment-retry"
          >
            <Icon name="undo" size={15} color={c.ink} />
            <Text variant="bodyStrong" color={c.ink} style={styles.retryText}>
              {L.retry}
            </Text>
          </Pressable>
        </View>
      ) : (
        <Text variant="caption" color={c.inkMuted} style={styles.failedText}>
          {L.sending}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: space2, marginBottom: space2 },
  title: { flex: 1, fontSize: 20, lineHeight: 22 },
  closex: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  scroll: { flexShrink: 1 },
  list: { gap: space3, paddingBottom: space2 },
  item: { gap: 6 },
  repliesWrap: { paddingLeft: 38, gap: 6 },
  more: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 30, alignSelf: "flex-start" },
  moreText: { fontSize: 12.5 },
  replies: { gap: space2 + 2, borderLeftWidth: 2, paddingLeft: 10 },
  off: { paddingVertical: space2 },
  composer: { gap: space2, paddingTop: space2 },
  inputRow: { flexDirection: "row", alignItems: "center", gap: space2 },
  input: {
    flex: 1,
    minWidth: 0,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: tokens.radius.radiusPill,
    borderWidth: 1.5,
    fontSize: 14,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.radiusPill,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  sendOff: { opacity: 0.45 },
  counter: { alignSelf: "flex-end" },
  replyto: { flexDirection: "row", alignItems: "center", gap: 8 },
  replytoText: { flex: 1, fontSize: 12.5 },
  replytoX: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  menu: { borderRadius: tokens.radius.radiusLg, overflow: "hidden" },
  pending: { gap: 4, paddingLeft: 38 },
  sending: { opacity: 0.5 },
  pendingText: { fontSize: 13.5, lineHeight: 19 },
  failed: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  failedText: { fontSize: 12 },
  retry: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 30, marginLeft: "auto" },
  retryText: { fontSize: 12 },
});
