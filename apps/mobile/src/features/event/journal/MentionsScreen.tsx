// L'écran « Mentions · N » d'un événement (maquette R8.5 `mentionsH`) : ce que les autres publient en citant l'événement, à part,
// jamais mêlé au journal. « Sur place » (pros et prestataires retenus : une carte chacun, « Sa fiche ») et « Passionnés » (comptes
// publics ; après l'événement, présence validée seulement : tampon « Présent »). Une rubrique vide n'est pas affichée. Un
// responsable de la fiche a un « … » par mention (« Masquer de la fiche » / « Remettre sur la fiche ») et le filtre « Masquées » ;
// un passionné n'en voit aucun. Chaque écriture revérifie les droits dans l'API.
import { Chip, ChipRow, Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  authorFichePath,
  type FeedPostView,
  eventJournalLabels as L,
  type MentionItem,
  mentionsPhase,
  type PageCounts,
  publicationPath,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { CrewPhotoImage } from "@/features/crews/feed/CrewPhotoImage";
import { SetRow } from "@/features/profil/parts";
import { api } from "@/lib/api";
import { now } from "@/lib/clock";
import { errorMessage } from "@/lib/http";
import { cacheScope } from "@/lib/kv";
import { createRequestGate } from "@/lib/requestGate";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "@/ui/AppSheet";
import { Avatar } from "@/ui/Avatar";
import { SmButton } from "@/ui/Kit";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { Overlay } from "@/ui/Overlay";
import { FlowScreen } from "@/ui/Screens";
import { Waiting } from "@/ui/Waiting";

const { space1, space2, space3, space4 } = tokens.spacing;

type Section = "on_site" | "fans";
type Filter = "visible" | "hidden";

/** Une page d'une rubrique (curseur gardé : « Voir plus » lit la suite, rien n'est abandonné sans le dire). */
const readPage = (eventId: string, section: Section, hidden: boolean, cursor: string | null) =>
  api.eventMentions(eventId, section, cursor, hidden);

function PhotoBox({ post, style }: { post: FeedPostView; style: object }) {
  const photo = post.photos[0];
  return photo ? <CrewPhotoImage url={photo.url} style={style} resizeMode="cover" /> : null;
}

export function MentionsScreen() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { status, me } = useSession();
  const event = useApi(() => api.eventBySlug(String(slug)), [slug, status], { enabled: status !== "loading" });
  const e = event.data;
  const manager = Boolean(e && me?.personas?.some((p) => p.kind === "organizer" && p.id === e.structure.id));
  const [filter, setFilter] = useState<Filter>("visible");
  const [items, setItems] = useState<Record<Section, MentionItem[]>>({ on_site: [], fans: [] });
  const [cursors, setCursors] = useState<Record<Section, string | null>>({ on_site: null, fans: null });
  const [loadingMore, setLoadingMore] = useState<Section | null>(null);
  const withHidden = useRef(false);
  // Une relecture est en cours : « Voir plus » attend qu'elle ait installé ses listes et ses curseurs (jamais une page des anciens
  // curseurs ajoutée aux nouvelles listes).
  const reading = useRef(false);
  const [read, setRead] = useState<"loading" | "ok" | "error" | "signin">("loading");
  const [menu, setMenu] = useState<MentionItem | null>(null);
  const [menuError, setMenuError] = useState<string | null>(null);
  const gate = useRef(createRequestGate(cacheScope)).current;

  const eventId = e?.id ?? null;
  const load = useCallback(async () => {
    if (!eventId) return;
    if (status !== "in") {
      setRead("signin");
      return;
    }
    const ticket = gate.start();
    reading.current = true;
    // Une pagination en vol est désormais jetée (ticket périmé) : son `finally` ne remettra plus le drapeau, c'est ici.
    setLoadingMore(null);
    try {
      // Un responsable lit aussi les masquées (le filtre les sépare) ; un refus (403) retombe sur la lecture ordinaire.
      const get = async (section: Section) => {
        try {
          withHidden.current = manager;
          return await readPage(eventId, section, manager, null);
        } catch (error) {
          if (manager) {
            withHidden.current = false;
            return readPage(eventId, section, false, null);
          }
          throw error;
        }
      };
      const [on_site, fans] = await Promise.all([get("on_site"), get("fans")]);
      if (!ticket.current()) return;
      setItems({ on_site: on_site.items, fans: fans.items });
      setCursors({ on_site: on_site.nextCursor, fans: fans.nextCursor });
      reading.current = false;
      setRead("ok");
    } catch {
      if (ticket.current()) {
        reading.current = false;
        setRead("error");
      }
    }
  }, [eventId, manager, status, gate]);
  useEffect(() => {
    setRead("loading");
    void load();
    return () => gate.invalidate();
  }, [load, gate]);

  async function more(section: Section) {
    const cursor = cursors[section];
    if (!cursor || !eventId || loadingMore || reading.current) return;
    // Une réponse qui arrive après un changement de compte ou de fiche (ou un nouveau chargement) est jetée : jamais les mentions
    // masquées d'un responsable dans l'écran d'un autre compte.
    const ticket = gate.follow();
    setLoadingMore(section);
    try {
      const page = await readPage(eventId, section, withHidden.current, cursor);
      if (!ticket.current()) return;
      setItems((s) => ({
        ...s,
        [section]: [...s[section], ...page.items.filter((n) => !s[section].some((o) => o.post.id === n.post.id))],
      }));
      setCursors((s) => ({ ...s, [section]: page.nextCursor }));
    } catch {
      if (ticket.current()) setRead("error");
    } finally {
      if (ticket.current()) setLoadingMore(null);
    }
  }
  const moreButton = (section: Section) =>
    cursors[section] ? (
      <SmButton
        kind="s"
        wide
        icon="down"
        disabled={loadingMore === section}
        onPress={() => void more(section)}
        testID={`mentions-more-${section}`}
      >
        {L.more}
      </SmButton>
    ) : null;

  const close = () =>
    router.canGoBack() ? router.back() : router.replace({ pathname: "/e/[slug]", params: { slug: String(slug) } });

  const shown = (section: Section) =>
    items[section].filter((i) => (manager ? (filter === "hidden" ? i.hidden : !i.hidden) : true));
  const onSite = shown("on_site");
  const fans = shown("fans");
  // Le titre dit le nombre de la fiche (toutes les mentions visibles), pas celui des pages déjà lues.
  const total =
    (e as PageCounts | undefined)?.mentions?.count ??
    items.on_site.filter((i) => !i.hidden).length + items.fans.filter((i) => !i.hidden).length;
  const phase = e ? mentionsPhase(e, now()) : "before";

  async function toggleHidden(item: MentionItem) {
    if (!eventId) return;
    setMenuError(null);
    try {
      await api.hideEventMention(eventId, item.post.id, !item.hidden);
      setMenu(null);
      await load();
    } catch (error) {
      setMenuError(errorMessage(error));
    }
  }

  const dots = (item: MentionItem) =>
    manager ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={L.menuOpen}
        onPress={() => setMenu(item)}
        hitSlop={6}
        style={styles.dots}
        testID="mention-menu"
      >
        <Icon name="more" size={18} color={c.inkMuted} />
      </Pressable>
    ) : null;

  const subtitle = (post: FeedPostView) => {
    const kind =
      post.author.kind === "provider" ? L.kindProvider : post.author.kind === "pro" ? L.kindPro : L.kindMedia;
    return `${kind} · ${phase === "after" ? L.stateAfter : L.stateBefore}`;
  };

  return (
    <FlowScreen
      title={L.mentionsTitle(total)}
      onClose={close}
      closeLabel={L.backToEvent}
      onRefresh={async () => {
        await load();
      }}
    >
      {read === "loading" || event.loading ? <Waiting blocks={[160, 160]} label={L.mentionsLoading} /> : null}
      {read === "error" || event.error ? <LoadError message={L.mentionsError} onRetry={() => void load()} /> : null}
      {read === "signin" ? <Muted variant="body">{L.mentionsEmpty}</Muted> : null}
      {read === "ok" ? (
        <View style={styles.wrap} testID="event-mentions">
          {manager ? (
            <ChipRow accessibilityRole="tablist">
              {(["visible", "hidden"] as const).map((f) => (
                <Chip key={f} accessibilityRole="tab" selected={filter === f} onPress={() => setFilter(f)}>
                  {f === "visible" ? L.filterVisible : L.filterHidden}
                </Chip>
              ))}
            </ChipRow>
          ) : null}

          {onSite.length > 0 || cursors.on_site ? (
            <View style={styles.section} testID="mentions-on-site">
              <View style={styles.sectionHead}>
                <Icon name="truck" size={16} color={c.inkMuted} />
                <Text variant="bodyStrong" color={c.ink}>
                  {L.onSite}
                </Text>
                <Text variant="caption" color={c.inkMuted}>
                  {onSite.length}
                </Text>
              </View>
              {onSite.map((item) => {
                const href = authorFichePath(item.post.author);
                return (
                  <View
                    key={item.post.id}
                    style={[styles.place, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}
                    testID="mention-on-site"
                  >
                    <View style={styles.placeHead}>
                      <Avatar url={item.post.author.avatarUrl} pseudo={item.post.author.name} size={38} />
                      <View style={styles.placeText}>
                        <Text variant="bodyStrong" color={c.ink}>
                          {item.post.author.name}
                        </Text>
                        <Muted variant="caption">{subtitle(item.post)}</Muted>
                        {item.hidden ? <Muted variant="caption">{L.hiddenTag}</Muted> : null}
                      </View>
                      {dots(item)}
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={item.post.caption ?? item.post.author.name}
                      onPress={() => router.push(publicationPath(item.post.id) as never)}
                      style={styles.shot}
                    >
                      <PhotoBox post={item.post} style={styles.shotImage} />
                    </Pressable>
                    {item.post.caption ? (
                      <Text variant="body" color={c.ink} numberOfLines={3}>
                        {item.post.caption}
                      </Text>
                    ) : null}
                    {href ? (
                      <SmButton
                        kind="s"
                        icon="next"
                        onPress={() => router.push(href as never)}
                        testID="mention-her-page"
                      >
                        {L.herPage}
                      </SmButton>
                    ) : null}
                  </View>
                );
              })}
              {moreButton("on_site")}
            </View>
          ) : null}

          {fans.length > 0 || cursors.fans ? (
            <View style={styles.section} testID="mentions-fans">
              <View style={styles.sectionHead}>
                <Icon name="profile" size={16} color={c.inkMuted} />
                <Text variant="bodyStrong" color={c.ink}>
                  {phase === "after" ? L.fansAfter : L.fansBefore}
                </Text>
                <Text variant="caption" color={c.inkMuted}>
                  {fans.length}
                </Text>
              </View>
              <View style={styles.rail}>
                {fans.map((item) => (
                  <View key={item.post.id} style={styles.fan} testID="mention-fan">
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={item.post.author.pseudo}
                      onPress={() => router.push(publicationPath(item.post.id) as never)}
                      style={[styles.fanShot, { backgroundColor: c.surface }]}
                    >
                      <PhotoBox post={item.post} style={styles.shotImage} />
                      <View style={[styles.who, { backgroundColor: c.scrim }]}>
                        <Text variant="caption" color={c.nightInk} numberOfLines={1}>
                          {item.post.author.pseudo}
                        </Text>
                      </View>
                      {item.post.attach?.presenceValidated ? (
                        <View style={[styles.stamp, { backgroundColor: c.accent }]} testID="mention-present">
                          <Icon name="stamp" size={12} color={c.accentInk} />
                          <Text variant="caption" color={c.accentInk} style={styles.stampText}>
                            {L.present}
                          </Text>
                        </View>
                      ) : null}
                    </Pressable>
                    {dots(item)}
                  </View>
                ))}
              </View>
              {moreButton("fans")}
              <Muted variant="caption" testID="mentions-fans-note">
                {phase === "after" ? L.fansNoteAfter : L.fansNoteBefore}
              </Muted>
            </View>
          ) : null}

          {onSite.length === 0 && fans.length === 0 && !cursors.on_site && !cursors.fans ? (
            <Muted variant="body">{L.mentionsEmpty}</Muted>
          ) : null}
        </View>
      ) : null}

      <Overlay>
        <AppSheet
          visible={Boolean(menu)}
          onClose={() => {
            setMenu(null);
            setMenuError(null);
          }}
          accessibilityLabel={L.menuOpen}
        >
          {menu ? (
            <View style={styles.menu}>
              <Text variant="posterM" color={c.ink} style={styles.menuTitle} accessibilityRole="header">
                {L.menuTitle}
              </Text>
              {menuError ? <Notice tone="error">{menuError}</Notice> : null}
              <View style={[styles.menuList, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}>
                <SetRow
                  first
                  icon={menu.hidden ? "undo" : "eye"}
                  title={menu.hidden ? L.unhide : L.hide}
                  onPress={() => void toggleHidden(menu)}
                  testID="mention-menu-hide"
                />
              </View>
            </View>
          ) : null}
        </AppSheet>
      </Overlay>
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space4 },
  section: { gap: space3 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: space2 },
  place: { gap: space3, padding: space3, borderRadius: tokens.radius.radiusLg },
  placeHead: { flexDirection: "row", alignItems: "center", gap: space3 },
  placeText: { flex: 1, minWidth: 0 },
  shot: { height: 120, borderRadius: tokens.radius.radiusMd, overflow: "hidden" },
  shotImage: { width: "100%", height: "100%" },
  rail: { flexDirection: "row", flexWrap: "wrap", gap: space3 },
  fan: { width: 118 },
  fanShot: { width: "100%", aspectRatio: 4 / 5, borderRadius: tokens.radius.radiusMd, overflow: "hidden" },
  who: {
    position: "absolute",
    left: space1,
    right: space1,
    top: space1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  stamp: {
    position: "absolute",
    left: 5,
    bottom: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    height: 20,
    borderRadius: 6,
  },
  stampText: { fontSize: 10.5, lineHeight: 14 },
  dots: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  menu: { gap: space3 },
  menuTitle: { fontSize: 20, lineHeight: 22 },
  menuList: { borderRadius: tokens.radius.radiusLg, overflow: "hidden" },
});
