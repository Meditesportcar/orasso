// La section « Publications » de la fiche d'un événement (maquette R8.5 `ficheH`, classe `.r8aut`) : le journal de l'événement,
// les publications de l'organisateur rattachées à la fiche, l'épinglée en tête, les deux vues de la brique de R8b2, puis la ligne
// « Mentions · N ». Sans publication : rien (l'organisateur voit l'invitation « Publier pour cet événement »). Sans session : le
// journal en lecture, sans « Mentions » ni menu. Les droits viennent de l'API ; l'écran n'en décide pas.
import { Button, Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type FeedPostView,
  journalSection,
  eventJournalLabels as L,
  PUBLICATIONS_VIEW_KEY,
  type PublicationsViewMode,
  pinGesture,
  showMentionsRow,
  viewMode,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { PostMenu } from "@/features/publications/PostMenu";
import { PublicationsGrid } from "@/features/publications/PublicationsGrid";
import { PublicationsOneByOne } from "@/features/publications/PublicationsOneByOne";
import { ViewToggle } from "@/features/publications/ViewToggle";
import { api } from "@/lib/api";
import { cacheGetJson, cacheSetJson } from "@/lib/kv";
import { SmButton } from "@/ui/Kit";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { Waiting } from "@/ui/Waiting";
import { useJournal } from "./useJournal";

const { space1, space2, space3, space4 } = tokens.spacing;

/** Le choix d'affichage est celui de la liste d'un profil (même clé, retenu par compte). */
function useViewMode(): [PublicationsViewMode, (mode: PublicationsViewMode) => void] {
  const [mode, setMode] = useState<PublicationsViewMode>("grid");
  useEffect(() => {
    let alive = true;
    void cacheGetJson<string>(PUBLICATIONS_VIEW_KEY)
      .then((stored) => alive && setMode(viewMode(stored)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return [
    mode,
    (next) => {
      setMode(next);
      void cacheSetJson(PUBLICATIONS_VIEW_KEY, next).catch(() => undefined);
    },
  ];
}

export function JournalSection({
  eventId,
  eventSlug,
  structureId,
  structureName,
  count,
  mentions,
  manager,
  signedIn,
}: {
  eventId: string;
  eventSlug: string;
  structureId: string;
  structureName: string;
  /** `publications.count` de la fiche (le journal) ; absent : inconnu, on lit la liste. */
  count: number | undefined;
  /** `mentions.count` de la fiche (absent sans session). */
  mentions: number | undefined;
  /** Je suis responsable de la structure de l'événement (casquette organisateur) : menus et invitation. */
  manager: boolean;
  signedIn: boolean;
}) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const kind = journalSection({ count: count ?? 1, manager: manager && signedIn });
  // Le compteur dit 0 : rien à lire (pas de requête). Inconnu : on lit.
  const list = useJournal(eventId, count !== 0);
  const [mode, setMode] = useViewMode();
  const [menu, setMenu] = useState<FeedPostView | null>(null);

  const publish = () =>
    router.push({ pathname: "/fil/publier", params: { structure: structureId, evenement: eventId } });
  const mentionsRow = showMentionsRow({ signedIn, count: mentions });

  const showList = count !== 0 && (list.loading || list.items.length > 0 || Boolean(list.error));
  if (!showList && kind !== "invite" && !mentionsRow) return null;

  const journal = !signedIn ? { readOnly: true } : manager ? { onMenu: (post: FeedPostView) => setMenu(post) } : {};

  return (
    <View style={styles.section} testID="event-journal">
      {showList || kind === "invite" ? (
        <>
          <Text variant="posterM" color={c.ink} style={styles.title} accessibilityRole="header" testID="journal-title">
            {L.title}
          </Text>
          <Muted variant="caption" style={styles.intro} testID="journal-intro">
            {L.intro(structureName, manager && signedIn)}
          </Muted>
        </>
      ) : null}

      {showList && !list.loaded && list.loading ? (
        <Waiting blocks={[220]} label={L.loading} testID="journal-loading" />
      ) : null}
      {showList && list.error && !list.loaded ? (
        <LoadError message={L.error} onRetry={() => void list.reload()} />
      ) : null}

      {list.items.length > 0 ? (
        <View style={styles.list}>
          {signedIn ? (
            <View style={styles.head}>
              <ViewToggle value={mode} onChange={setMode} />
            </View>
          ) : null}
          {signedIn && mode === "one" ? (
            <PublicationsOneByOne posts={list.items} journal={journal} />
          ) : (
            <PublicationsGrid posts={list.items} journal={journal} />
          )}
          {list.error ? (
            <LoadError message={L.error} onRetry={() => void (list.nextCursor ? list.more() : list.reload())} />
          ) : null}
          {list.nextCursor && !list.error ? (
            <SmButton
              kind="s"
              wide
              icon="down"
              disabled={list.loadingMore}
              onPress={() => void list.more()}
              testID="journal-more"
            >
              {L.more}
            </SmButton>
          ) : null}
        </View>
      ) : null}

      {kind === "invite" && list.items.length === 0 && (count === 0 || (!list.loading && !list.error)) ? (
        <View
          style={[styles.invite, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}
          testID="journal-invite"
        >
          <Icon name="camera" size={28} color={c.accentText} />
          <Text variant="bodyStrong" color={c.ink} style={styles.center}>
            {L.inviteTitle}
          </Text>
          <Muted variant="caption" style={styles.center}>
            {L.inviteText}
          </Muted>
          <Button variant="primary" icon="camera" onPress={publish} testID="journal-publish">
            {L.publishFor}
          </Button>
        </View>
      ) : null}

      {mentionsRow ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={L.mentionsRow(mentions ?? 0)}
          onPress={() => router.push({ pathname: "/e/mentions/[slug]", params: { slug: eventSlug } })}
          style={[styles.row, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}
          testID="event-mentions-row"
        >
          <Icon name="profile" size={20} color={c.accentText} />
          <View style={styles.rowText}>
            <Text variant="bodyStrong" color={c.ink}>
              {L.mentionsRow(mentions ?? 0)}
            </Text>
            <Muted variant="caption">{L.mentionsHint}</Muted>
          </View>
          <Icon name="next" size={16} color={c.inkMuted} />
        </Pressable>
      ) : null}

      <PostMenu
        post={menu}
        canDelete={false}
        pin={
          menu
            ? {
                pinned: menu.pinned,
                onToggle: async () => {
                  await api.pinJournalPost(eventId, menu.id, pinGesture(menu.pinned) === "pin");
                  await list.reload();
                },
              }
            : undefined
        }
        onClose={() => setMenu(null)}
        onRemoved={() => undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space3, paddingTop: space2 },
  title: { fontSize: 20, lineHeight: 22 },
  intro: { marginTop: -space1 },
  head: { flexDirection: "row", justifyContent: "flex-end" },
  list: { gap: space3 },
  center: { textAlign: "center" },
  invite: {
    alignItems: "center",
    gap: space2,
    paddingVertical: space4,
    paddingHorizontal: space4,
    borderRadius: tokens.radius.radiusLg,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space3,
    padding: space3,
    minHeight: tokens.spacing.touch,
    borderRadius: tokens.radius.radiusLg,
  },
  rowText: { flex: 1, minWidth: 0 },
});
