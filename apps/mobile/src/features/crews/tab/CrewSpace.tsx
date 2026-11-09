// Le crew affiché dans l'onglet Crew (lot R7b2, D38, maquette R7.11) : l'image du crew, sa description, la Discussion
// (avec ses non-lus), Inviter et Réglages (chef), puis les onglets internes Fil · Sorties · Membres · Spots. Reprend ce que
// faisait la page du crew (lots 19, R5c2, R6a, R6c) pour un membre actif : mêmes appels, mêmes règles (l'API décide).
// Le temps réel (`useCrewLive`) marche dans l'onglet : un signal relit la page (sorties, membres, demandes) ; retiré du
// crew, la liste de mes crews se relit (`onLost`).
import { Icon, Photo, Tag, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  crewInviteLabels as CL,
  type CrewOutingRsvp,
  type CrewOutingView,
  type CrewView,
  crewInstagramUrl,
  crewLabels,
  crewPageLabels as L,
  crewTabLabels as T,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { CrewInviteSheet } from "@/features/crews/CrewInviteSheet";
import { CrewFeed, type CrewFeedScroller } from "@/features/crews/feed/CrewFeed";
import { CrewPhotoImage } from "@/features/crews/feed/CrewPhotoImage";
import { useCrewLive } from "@/features/crews/feed/useCrewLive";
import { CrewSecHead, CrewTabs, MemberRow, vitrineCaption } from "@/features/crews/page/parts";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { SmButton } from "@/ui/Kit";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { ask } from "./ask";
import { type CrewTabId, tabOfParam } from "./crewTabModel";
import { CrewMembers } from "./Members";
import { CrewOutings } from "./Outings";
import { CrewSpots } from "./Spots";

const { space2, space3 } = tokens.spacing;

export function CrewSpace({
  slug,
  initialTab,
  scroller,
  onLost,
  onLoaded,
  refreshKey = 0,
}: {
  slug: string;
  /** L'onglet interne d'un lien (`?onglet=sorties`). */
  initialTab?: string | null;
  scroller?: CrewFeedScroller;
  /** Je ne suis plus membre de ce crew (retiré, parti, dissous) : la liste de mes crews se relit. */
  onLost: () => void;
  /** Le crew est lu : ses non-lus servent à la feuille du sélecteur. */
  onLoaded?: (view: CrewView) => void;
  /** Glisser pour recharger : le numéro change, la page se relit. */
  refreshKey?: number;
}) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { me } = useSession();
  const crew = useApi(() => api.crewBySlug(slug), [slug]);
  const v = crew.data;
  const member = v?.viewerState === "member" || v?.viewerState === "leader";
  const leader = v?.viewerState === "leader";
  const live = Boolean(v && !v.archived);
  const members = useApi(() => api.crewMembers(v?.id ?? ""), [v?.id, member], {
    enabled: Boolean(v && member && live),
  });
  const pending = useApi(() => api.crewPending(v?.id ?? ""), [v?.id, leader], {
    enabled: Boolean(v && leader && live),
  });
  const [tab, setTab] = useState<CrewTabId>(tabOfParam(initialTab));
  const [inviting, setInviting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const reloadAll = async () => {
    await Promise.all([crew.reload(), members.reload(), pending.reload()]);
  };
  // Un signal de sortie, d'arrivée, de départ ou de réglage relit la page ; retiré du crew (`revoked`), elle se relit.
  useCrewLive(
    v && member && live ? v.id : null,
    async (needs) => {
      if (needs.page) await reloadAll();
    },
    {
      onRevoked: () => {
        void crew.reload();
        onLost();
      },
    },
  );
  // Un crew qui n'est plus le mien (retiré, parti) ou introuvable : l'onglet relit mes crews et en montre un autre.
  const gone = v ? !member && !v.archived : crew.error?.status === 404;
  const lost = useRef(onLost);
  lost.current = onLost;
  const loaded = useRef(onLoaded);
  loaded.current = onLoaded;
  useEffect(() => {
    if (gone) lost.current();
  }, [gone]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: seul le numéro de rechargement relance la lecture.
  useEffect(() => {
    if (refreshKey > 0) void reloadAll();
  }, [refreshKey]);
  useEffect(() => {
    if (v) loaded.current?.(v);
  }, [v]);

  async function run(action: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await action();
      if (done) setOk(done);
      await reloadAll();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!v) {
    return crew.error && crew.error.status !== 404 ? (
      <LoadError message={crew.error.message} onRetry={() => void crew.reload()} />
    ) : (
      <Muted variant="body">Chargement…</Muted>
    );
  }
  if (gone) return <Muted variant="body">Chargement…</Muted>;

  const space = v.space;
  /** Une sortie mise à jour (réponse) remplace l'ancienne sans recharger la page. */
  const patchOuting = (next: CrewOutingView) =>
    crew.setData({
      ...v,
      space: space ? { ...space, outings: space.outings.map((o) => (o.id === next.id ? next : o)) } : null,
    } satisfies CrewView);
  const answer = (o: CrewOutingView, a: CrewOutingRsvp) =>
    void (async () => {
      setBusy(true);
      setError(null);
      try {
        patchOuting(await api.answerCrewOuting(v.id, o.id, a));
      } catch (e) {
        setError(errorMessage(e));
      } finally {
        setBusy(false);
      }
    })();
  const cancelOuting = async (o: CrewOutingView) => {
    if (!(await ask(L.cancelOutingConfirm(o.title)))) return;
    void run(() => api.cancelCrewOuting(v.id, o.id), L.outingCancelled);
  };
  const requests = pending.data?.requests ?? [];

  // Lot R6c (R6.7) : tout membre actif invite une personne de son réseau ; le chef confirme son arrivée.
  const inviteSheet = (
    <CrewInviteSheet
      crew={inviting ? { id: v.id, name: v.name, leaderPseudo: v.leader?.pseudo ?? null } : null}
      leader={Boolean(leader)}
      onClose={() => setInviting(false)}
      onSent={(pseudo) => {
        setInviting(false);
        setError(null);
        setOk(
          `${CL.sentTitle(pseudo)}. ${leader ? CL.sentByLeader : CL.sentByMember(v.leader?.pseudo ?? CL.leaderFallback)}`,
        );
        void reloadAll();
      }}
    />
  );

  return (
    <View style={styles.col} testID="crew-space" accessibilityLabel={`${crewLabels.crew} ${v.name}`}>
      {/* Tour 2 (R5c2) : la bannière est lue par une adresse protégée (session), en mémoire seulement. */}
      {v.bannerUrl ? (
        <View style={[styles.cover, { backgroundColor: c.night }]} testID="crew-cover">
          <Photo
            placeholder={`linear-gradient(160deg, ${c.surfaceRaised} 0%, ${c.night} 100%)`}
            style={StyleSheet.absoluteFill}
          />
          <CrewPhotoImage
            url={v.bannerUrl}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            accessibilityLabel={`Bannière de ${v.name}`}
          />
        </View>
      ) : null}
      {v.description ? (
        <Text variant="body" color={c.inkMuted} style={styles.bio} testID="crew-description">
          {v.description}
        </Text>
      ) : null}
      {leader || v.instagram ? (
        <View style={styles.chips}>
          {leader ? <Tag tone="acc">{L.youLead}</Tag> : null}
          {v.instagram ? (
            <Pressable
              onPress={() => v.instagram && void Linking.openURL(crewInstagramUrl(v.instagram)).catch(() => undefined)}
              accessibilityRole="link"
              accessibilityLabel={L.instagramA11y(v.instagram)}
              style={[styles.sc, { backgroundColor: c.surface, borderColor: c.line }]}
              testID="crew-instagram"
            >
              <Icon name="instagram" size={16} color={c.ink} />
              <Text variant="bodyStrong" color={c.ink} style={styles.scText}>
                {v.instagram}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {v.archived ? <Notice>{L.archived}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {ok ? <Notice>{ok}</Notice> : null}

      {/* `.r7three` : Discussion (avec ses non-lus), Inviter et Réglages pour le chef. */}
      {member && v.conversationId ? (
        <View style={styles.actions}>
          <View style={styles.grow}>
            <SmButton
              kind="s"
              big
              wide
              icon="chat"
              onPress={() => router.push(`/boite/${v.conversationId}`)}
              accessibilityLabel={L.discussionA11y(space?.unreadCount ?? 0)}
              testID="crew-discussion"
            >
              {L.discussion}
            </SmButton>
            {space && space.unreadCount > 0 ? (
              <View style={[styles.dot, { backgroundColor: c.accent }]} pointerEvents="none" testID="crew-unread">
                <Text variant="meta" color={c.accentInk} style={styles.dotText}>
                  {space.unreadCount > 99 ? "99+" : String(space.unreadCount)}
                </Text>
              </View>
            ) : null}
          </View>
          {leader && live ? (
            <>
              <SmButton
                kind="s"
                big
                icon="share"
                onPress={() => setInviting(true)}
                accessibilityLabel={L.inviteA11y}
                testID="crew-invite"
              />
              <SmButton
                kind="s"
                big
                icon="gear"
                onPress={() => router.push({ pathname: "/crew/reglages", params: { crew: v.slug } })}
                accessibilityLabel={L.settingsA11y}
                testID="crew-settings"
              />
            </>
          ) : null}
        </View>
      ) : null}

      {space ? (
        <>
          <CrewTabs<CrewTabId>
            items={[
              { id: "feed", label: L.tabFeed, testID: "crew-tab-feed" },
              { id: "outings", label: L.tabCount(L.tabOutings, space.outings.length), testID: "crew-tab-outings" },
              {
                id: "members",
                label: L.tabCount(L.tabMembers, leader ? requests.length : 0),
                testID: "crew-tab-members",
              },
              { id: "spots", label: T.tabSpots, testID: "crew-tab-spots" },
            ]}
            value={tab}
            onChange={setTab}
          />
          {tab === "feed" ? (
            <CrewFeed crew={{ id: v.id, slug: v.slug, archived: v.archived }} scroller={scroller} />
          ) : null}
          {tab === "outings" ? (
            <CrewOutings
              slug={v.slug}
              space={space}
              leader={Boolean(leader)}
              busy={busy}
              onAnswer={answer}
              onCancel={(o) => void cancelOuting(o)}
            />
          ) : null}
          {tab === "members" ? (
            <CrewMembers
              crew={v}
              members={members.data}
              garage={space.garage}
              requests={requests}
              leader={Boolean(leader)}
              live={live}
              busy={busy}
              onInvite={() => setInviting(true)}
              onAccept={(userId) => void run(() => api.acceptCrewRequest(v.id, userId))}
              onDecline={(userId) => void run(() => api.declineCrewRequest(v.id, userId))}
              onLeave={() =>
                void (async () => {
                  if (!me || !(await ask(crewLabels.leaveConfirm))) return;
                  await run(() => api.removeCrewMember(v.id, me.user.id));
                  onLost();
                })()
              }
            />
          ) : null}
          {tab === "spots" ? <CrewSpots crewId={v.id} archived={v.archived} /> : null}
        </>
      ) : (
        // Crew dissous : la discussion reste lisible, les membres se voient.
        <View style={styles.col}>
          <CrewSecHead title={L.membersTitle} hint={String(v.membersCount)} />
          {v.members.map((m) => (
            <MemberRow
              key={m.pseudo}
              pseudo={m.pseudo}
              avatarUrl={m.avatarUrl}
              caption={vitrineCaption(m)}
              leader={m.role === "leader"}
              onPress={() => router.push(`/u/${encodeURIComponent(m.pseudo)}`)}
            />
          ))}
        </View>
      )}
      {member && live ? inviteSheet : null}
    </View>
  );
}

const styles = StyleSheet.create({
  col: { gap: space3 },
  cover: { height: 130, borderRadius: tokens.radius.radiusLg, overflow: "hidden" },
  bio: { fontSize: 13.5, lineHeight: 19.5 },
  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space2 },
  sc: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 32,
    paddingLeft: 9,
    paddingRight: 11,
    borderRadius: tokens.radius.radiusPill,
    borderWidth: 1.5,
  },
  scText: { fontSize: 12.5 },
  actions: { flexDirection: "row", alignItems: "stretch", gap: space2 },
  grow: { flex: 1, minWidth: 0 },
  dot: {
    position: "absolute",
    top: 6,
    right: 8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  dotText: { fontSize: 11, lineHeight: 13 },
});
