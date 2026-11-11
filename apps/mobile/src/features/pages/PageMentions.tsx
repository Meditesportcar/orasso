// L'onglet « Mentions · N » d'une page (lot R8g, maquette R8.6 `menRow` et R9.3) : ce que les autres publient en citant la page
// (structure : ses événements et les `@` ; pro : les collaborations commerciales et les `@`). Ces publications **restent chez
// leur auteur** : une ligne ouvre la publication, le nom de la personne ouvre son profil. Pour un responsable de la page (ou
// quand la liste rend `hidden`) : « … » → « Masquer de la page » / « Remettre sur la page » ; l'écriture revérifie ses droits
// (second facteur compris) côté API. Une panne n'est jamais « Personne n'a encore cité cette page. ».
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import { pagesLabels as L, type MentionItem, type MentionsPage, mentionLine, publicationPath } from "@orasso/shared";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { CrewPhotoImage } from "@/features/crews/feed/CrewPhotoImage";
import { SetList, SetRow } from "@/features/profil/parts";
import { api } from "@/lib/api";
import { ApiRequestError, errorMessage } from "@/lib/http";
import { AppSheet } from "@/ui/AppSheet";
import { Avatar } from "@/ui/Avatar";
import { SmButton } from "@/ui/Kit";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { Overlay } from "@/ui/Overlay";
import { Waiting } from "@/ui/Waiting";

const { space1, space2, space3 } = tokens.spacing;

type State = { items: MentionItem[]; next: string | null; loading: boolean; loaded: boolean; error: boolean };

const merge = (list: MentionItem[], page: MentionItem[]): MentionItem[] => {
  const seen = new Set(list.map((i) => i.post.id));
  return [...list, ...page.filter((i) => !seen.has(i.post.id))];
};

/**
 * La liste des mentions d'une page, page par page. `manage` : un responsable (la liste rend alors les masquées, `hidden=1` ; un
 * 403 ramène à la liste ordinaire). `seeHidden` dit quel mode la première lecture a retenu : la suite et les écritures le suivent.
 */
function useMentions(pageKey: string, manage: boolean) {
  const [state, setState] = useState<State>({ items: [], next: null, loading: true, loaded: false, error: false });
  const [seeHidden, setSeeHidden] = useState(false);
  const mode = useRef(false);
  const cursor = useRef<string | null>(null);
  const seq = useRef(0);

  const read = useCallback(
    async (first: boolean) => {
      const mine = first ? ++seq.current : seq.current;
      setState((s) => ({ ...s, loading: true, error: false }));
      try {
        let page: MentionsPage;
        if (first) {
          try {
            page = await api.authorMentions(pageKey, null, manage);
            mode.current = manage;
          } catch (e) {
            if (!(manage && e instanceof ApiRequestError && e.status === 403)) throw e;
            page = await api.authorMentions(pageKey, null, false);
            mode.current = false;
          }
        } else {
          page = await api.authorMentions(pageKey, cursor.current, mode.current);
        }
        if (mine !== seq.current) return;
        if (first) setSeeHidden(mode.current);
        cursor.current = page.nextCursor;
        setState((s) => ({
          items: first ? page.items : merge(s.items, page.items),
          next: page.nextCursor,
          loading: false,
          loaded: true,
          error: false,
        }));
      } catch {
        if (mine !== seq.current) return;
        setState((s) => ({ ...s, loading: false, error: true }));
      }
    },
    [pageKey, manage],
  );

  useEffect(() => {
    cursor.current = null;
    setState({ items: [], next: null, loading: true, loaded: false, error: false });
    void read(true);
    return () => {
      seq.current++;
    };
  }, [read]);

  const setHidden = (postId: string, hidden: boolean) =>
    setState((s) => ({
      ...s,
      // Un responsable garde la ligne (marquée « Masquée ») ; sans les masquées, elle sort de la liste.
      items: mode.current
        ? s.items.map((i) => (i.post.id === postId ? { ...i, hidden } : i))
        : s.items.filter((i) => i.post.id !== postId),
    }));

  return { ...state, reload: () => read(true), more: () => read(false), setHidden, seeHidden };
}

function Row({
  item,
  pageName,
  manage,
  onMenu,
}: {
  item: MentionItem;
  pageName: string;
  manage: boolean;
  onMenu: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { post } = item;
  const line = mentionLine(item, pageName);
  const photo = post.photos[0];
  const person = post.author.kind === "user";
  return (
    <View style={[styles.row, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]} testID="mention-row">
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${L.mentionOpen} : ${post.author.name}`}
        onPress={() => router.push(publicationPath(post.id) as never)}
        style={({ pressed }) => [styles.open, pressed && styles.pressed]}
        testID="mention-open"
      >
        <View style={[styles.thumb, { backgroundColor: c.surfaceRaised }]}>
          {photo ? <CrewPhotoImage url={photo.url} style={styles.thumbImage} resizeMode="cover" /> : null}
        </View>
      </Pressable>
      <View style={styles.text}>
        <Pressable
          accessibilityRole={person ? "link" : undefined}
          accessibilityLabel={person ? L.mentionAuthor(post.author.name) : undefined}
          disabled={!person}
          onPress={() => router.push(`/u/${encodeURIComponent(post.author.pseudo)}` as never)}
          style={styles.author}
          testID="mention-author"
        >
          <Avatar url={post.author.avatarUrl} pseudo={post.author.name} size={22} />
          <Text variant="bodyStrong" color={c.ink} style={styles.authorName}>
            {post.author.name}
          </Text>
        </Pressable>
        {line.text ? (
          <Muted variant="caption" testID="mention-line">
            {line.text}
          </Muted>
        ) : null}
        {line.commercial ? (
          <View style={styles.tag} testID="mention-commercial">
            <Icon name="share" size={13} color={c.inkMuted} />
            <Text variant="label" color={c.inkMuted}>
              {L.commercialTag.toUpperCase()}
            </Text>
          </View>
        ) : null}
        {item.hidden ? (
          <Text variant="label" color={c.accentText} testID="mention-hidden">
            {L.hiddenTag.toUpperCase()}
          </Text>
        ) : null}
      </View>
      {manage ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={L.moreTitle}
          onPress={onMenu}
          hitSlop={6}
          style={styles.more}
          testID="mention-more"
        >
          <Icon name="more" size={20} color={c.ink} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function PageMentions({
  pageKey,
  pageName,
  manage,
  onHiddenChange,
}: {
  /** La clé de la page : `s:<structure>` ou `p:<fiche pro>` (aussi la cible de « Masquer »). */
  pageKey: string;
  pageName: string;
  /** Le regard est celui d'un responsable de la page (l'API revérifie). */
  manage: boolean;
  /** Une mention masquée (`-1`) ou remise (`+1`) : le nombre de l'onglet suit. */
  onHiddenChange?: (delta: number) => void;
}) {
  const list = useMentions(pageKey, manage);
  const [menu, setMenu] = useState<MentionItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canManage = manage && list.seeHidden;

  async function toggle(item: MentionItem) {
    setBusy(true);
    setError(null);
    try {
      if (item.hidden) await api.unhideMention(pageKey, item.post.id);
      else await api.hideMention(pageKey, item.post.id);
      list.setHidden(item.post.id, !item.hidden);
      onHiddenChange?.(item.hidden ? 1 : -1);
      setMenu(null);
    } catch (e) {
      setError(e instanceof ApiRequestError ? errorMessage(e) : L.hideError);
    } finally {
      setBusy(false);
    }
  }

  if (list.loading && !list.loaded) return <Waiting blocks={[72, 72, 72]} label={L.mentionsLoading} />;
  if (list.error && !list.loaded) return <LoadError message={L.mentionsError} onRetry={() => void list.reload()} />;
  if (list.items.length === 0)
    return (
      <Muted variant="body" testID="mentions-empty">
        {L.mentionsEmpty}
      </Muted>
    );
  return (
    <View style={styles.list} testID="page-mentions">
      {list.items.map((item) => (
        <Row
          key={item.post.id}
          item={item}
          pageName={pageName}
          manage={canManage}
          onMenu={() => {
            setError(null);
            setMenu(item);
          }}
        />
      ))}
      {list.error ? <LoadError message={L.mentionsError} onRetry={() => void list.more()} /> : null}
      {list.next && !list.error ? (
        <SmButton
          kind="s"
          wide
          icon="down"
          disabled={list.loading}
          onPress={() => void list.more()}
          testID="mentions-more"
        >
          {L.mentionsMore}
        </SmButton>
      ) : null}
      <Overlay>
        <AppSheet visible={menu !== null} onClose={() => setMenu(null)} accessibilityLabel={L.moreTitle}>
          {error ? <Notice tone="error">{error}</Notice> : null}
          <SetList>
            <SetRow
              first
              icon={menu?.hidden ? "eye" : "eyeOff"}
              title={menu?.hidden ? L.unhide : L.hide}
              onPress={() => {
                if (menu && !busy) void toggle(menu);
              }}
              testID="mention-hide"
            />
          </SetList>
        </AppSheet>
      </Overlay>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: space2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    padding: space2,
    borderRadius: tokens.radius.radiusMd,
  },
  open: { borderRadius: tokens.radius.radiusSm },
  pressed: { opacity: 0.8 },
  thumb: { width: 56, height: 70, borderRadius: tokens.radius.radiusSm, overflow: "hidden" },
  thumbImage: { width: 56, height: 70 },
  text: { flex: 1, minWidth: 0, gap: space1 },
  author: { flexDirection: "row", alignItems: "center", gap: space2, minHeight: tokens.spacing.touch },
  authorName: { flexShrink: 1 },
  tag: { flexDirection: "row", alignItems: "center", gap: 4 },
  more: { width: tokens.spacing.touch, height: tokens.spacing.touch, alignItems: "center", justifyContent: "center" },
});
