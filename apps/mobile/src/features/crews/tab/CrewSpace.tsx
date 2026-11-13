// Le crew affiché dans l'onglet Crew (lot R7b2, D38, maquette R7.11) : le haut compact (`CrewHead`, petit lot de fin partie E :
// vignette de la couverture, nom, description repliée, Inviter et Réglages), la Discussion (avec ses non-lus), puis les onglets
// internes Fil · Sorties · Membres · Spots, soulignés et collants, « Publier » en icône au bout de leur rangée. Reprend ce que
// faisait la page du crew (lots 19, R5c2, R6a, R6c) pour un membre actif : mêmes appels, mêmes règles (l'API décide).
// Le temps réel (`useCrewLive`) marche dans l'onglet : un signal relit la page (sorties, membres, demandes) ; retiré du
// crew, la liste de mes crews se relit (`onLost`).
import { Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  crewInviteLabels as CL,
  type CrewOutingRsvp,
  type CrewOutingView,
  type CrewView,
  crewLabels,
  crewPageLabels as L,
  type MyCrew,
  crewTabLabels as T,
} from "@orasso/shared";
import { useNetworkState } from "expo-network";
import { useRouter } from "expo-router";
import { type ReactElement, useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { CrewInviteSheet } from "@/features/crews/CrewInviteSheet";
import { CrewFeed, type CrewFeedScroller } from "@/features/crews/feed/CrewFeed";
import { useCrewLive } from "@/features/crews/feed/useCrewLive";
import { CrewSecHead, MemberRow, vitrineCaption } from "@/features/crews/page/parts";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { SmButton } from "@/ui/Kit";
import { LoadError } from "@/ui/LoadError";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { Overlay } from "@/ui/Overlay";
import { UnderTabs } from "@/ui/UnderTabs";
import { ask } from "./ask";
import { CrewHead } from "./CrewHead";
import { CrewScroll, type CrewScrollProps } from "./CrewScroll";
import { type CrewTabId, tabOfParam } from "./crewTabModel";
import { CrewMembers } from "./Members";
import { CrewOutings } from "./Outings";
import { CrewSpots } from "./Spots";

const { space2, space3, space4 } = tokens.spacing;

export function CrewSpace({
  slug,
  crews,
  onChoose,
  linkTab,
  scroller,
  scroll,
  onLost,
  refreshKey = 0,
}: {
  slug: string;
  /** Mes crews (le nom ▾ ouvre « Mes crews » quand il y en a plusieurs) et le choix d'un autre. */
  crews: readonly MyCrew[];
  onChoose: (slug: string) => void;
  /** L'onglet interne d'un lien (`?onglet=sorties`) ; un lien reçu alors que le crew est déjà affiché change l'onglet (`n`). */
  linkTab?: { value: string | null | undefined; n: number };
  scroller?: CrewFeedScroller;
  /** La zone qui défile (la rangée d'onglets y reste collée) : sa position, son rechargement. */
  scroll: CrewScrollProps;
  /** Je ne suis plus membre de ce crew (retiré, parti, dissous) : la liste de mes crews se relit (`false` : panne). */
  onLost: () => Promise<boolean>;
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
  const [tab, setTab] = useState<CrewTabId>(() => tabOfParam(linkTab?.value));
  // Un lien reçu alors que le crew est déjà affiché (notification, `?onglet=sorties`) change l'onglet.
  const seenLink = useRef(linkTab?.n ?? 0);
  useEffect(() => {
    if (!linkTab || linkTab.n === seenLink.current) return;
    seenLink.current = linkTab.n;
    if (linkTab.value) setTab(tabOfParam(linkTab.value));
  }, [linkTab]);
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
        void onLost();
      },
    },
  );
  // Un crew qui n'est plus le mien (retiré, parti) ou introuvable : l'onglet relit mes crews et en montre un autre.
  const gone = v ? !member && !v.archived : crew.error?.status === 404;
  const lost = useRef(onLost);
  lost.current = onLost;
  // Perte d'appartenance suivie d'une panne : « Réessayer » au lieu d'un « Chargement… » sans fin, et reprise au retour du
  // réseau.
  const [lostFailed, setLostFailed] = useState(false);
  const network = useNetworkState();
  const retryLost = useCallback(async () => {
    setLostFailed(false);
    if (!(await lost.current())) setLostFailed(true);
  }, []);
  useEffect(() => {
    if (gone) void retryLost();
  }, [gone, retryLost]);
  // Au retour du réseau seulement (pas à chaque échec : la panne ne doit pas tourner en boucle).
  const online = network.isConnected !== false;
  const wasOnline = useRef(online);
  const needsRetry = useRef(false);
  needsRetry.current = gone && lostFailed;
  useEffect(() => {
    if (online && !wasOnline.current && needsRetry.current) void retryLost();
    wasOnline.current = online;
  }, [online, retryLost]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: seul le numéro de rechargement relance la lecture.
  useEffect(() => {
    if (refreshKey > 0) void reloadAll();
  }, [refreshKey]);

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

  // Rien à montrer encore (lecture, panne, crew perdu) : un seul bloc dans la zone qui défile.
  const alone = (node: ReactElement) => <CrewScroll {...scroll}>{[node]}</CrewScroll>;
  if (!v) {
    if (crew.error && crew.error.status !== 404) {
      return alone(<LoadError key="error" message={crew.error.message} onRetry={() => void crew.reload()} />);
    }
    // Crew introuvable (404) puis panne en relisant mes crews : « Réessayer », jamais un « Chargement… » sans fin.
    if (crew.error?.status === 404 && lostFailed) {
      return alone(<LoadError key="lost" message={T.loadError} onRetry={() => void retryLost()} />);
    }
    return alone(
      <Muted key="loading" variant="body">
        Chargement…
      </Muted>,
    );
  }
  if (gone) {
    return alone(
      lostFailed ? (
        <LoadError key="lost" message={T.loadError} onRetry={() => void retryLost()} />
      ) : (
        <Muted key="loading" variant="body">
          Chargement…
        </Muted>
      ),
    );
  }

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
  const unread = space?.unreadCount ?? 0;

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

  // Les blocs de l'espace, à plat : seul un enfant direct de la zone qui défile peut rester collé en haut.
  const blocks: ReactElement[] = [
    <View key="id" style={styles.col} testID="crew" accessibilityLabel={`${crewLabels.crew} ${v.name}`}>
      <CrewHead
        crew={v}
        crews={crews}
        leader={Boolean(leader)}
        member={member}
        live={live}
        unread={unread}
        onChoose={onChoose}
        onInvite={() => setInviting(true)}
      />
      {v.archived ? <Notice>{L.archived}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {ok ? <Notice>{ok}</Notice> : null}
      {/* Discussion : bouton secondaire pleine largeur, avec ses non-lus. */}
      {member && v.conversationId ? (
        <View>
          <SmButton
            kind="s"
            wide
            icon="chat"
            onPress={() => router.push(`/messages/${v.conversationId}`)}
            accessibilityLabel={L.discussionA11y(unread)}
            testID="crew-discussion"
          >
            {L.discussion}
          </SmButton>
          {unread > 0 ? (
            <View style={[styles.dot, { backgroundColor: c.accent }]} pointerEvents="none" testID="crew-unread">
              <Text variant="meta" color={c.accentInk} style={styles.dotText}>
                {unread > 99 ? "99+" : String(unread)}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>,
  ];
  let sticky: number | undefined;
  if (space) {
    sticky = blocks.length;
    // Onglets soulignés (collants) ; « Publier » : le bouton icône moutarde au bout de la rangée, comme le haut du Fil. C'est le
    // seul bouton principal et le seul néon de l'écran.
    blocks.push(
      <View key="tabs" style={[styles.tabsBar, { backgroundColor: c.ground }]}>
        <View style={styles.tabsRow}>
          <View style={styles.tabsGrow}>
            <UnderTabs<CrewTabId>
              fade
              value={tab}
              onChange={setTab}
              accessibilityLabel={crewLabels.crew}
              testID="crew-tabs"
              itemTestID={(id) => `crew-tab-${id}`}
              items={[
                { id: "feed", label: L.tabFeed },
                { id: "outings", label: L.tabOutings, count: space.outings.length || null },
                { id: "members", label: L.tabMembers, count: leader ? requests.length || null : null },
                { id: "spots", label: T.tabSpots },
              ]}
            />
          </View>
          {member && live ? (
            <SmButton
              kind="p"
              big
              icon="camera"
              onPress={() => router.push({ pathname: "/crew/publier", params: { crew: v.slug } })}
              accessibilityLabel={T.publishA11y}
              style={styles.publish}
              testID="crew-feed-publish"
            />
          ) : null}
        </View>
      </View>,
      <View key="body">
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
                void onLost();
              })()
            }
          />
        ) : null}
        {tab === "spots" ? <CrewSpots crewId={v.id} archived={v.archived} /> : null}
      </View>,
    );
  } else {
    // Crew dissous : la discussion reste lisible, les membres se voient.
    blocks.push(
      <View key="members" style={styles.col}>
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
      </View>,
    );
  }
  // Dans la zone des feuilles de l'écran (voir `Overlay`) : l'invitation couvre l'écran, pas le bas du contenu.
  if (member && live) blocks.push(<Overlay key="invite">{inviteSheet}</Overlay>);
  return (
    <CrewScroll {...scroll} sticky={sticky}>
      {blocks}
    </CrewScroll>
  );
}

const styles = StyleSheet.create({
  col: { gap: space3 },
  // La rangée collée : elle déborde du gutter de l'écran (le contenu qui passe dessous ne dépasse pas sur les côtés).
  tabsBar: { marginHorizontal: -space4, paddingHorizontal: space4 },
  tabsRow: { flexDirection: "row", alignItems: "center", gap: space2 },
  tabsGrow: { flex: 1, minWidth: 0 },
  // Maquette `.cpub` : le bouton icône du haut du Fil (A1), à la taille tactile du kit.
  publish: {
    width: tokens.spacing.touch,
    height: tokens.spacing.touch,
    minHeight: tokens.spacing.touch,
    paddingHorizontal: 0,
    borderRadius: 14,
    flexShrink: 0,
    justifyContent: "center",
    alignSelf: "center",
  },
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
