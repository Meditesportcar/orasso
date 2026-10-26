// Page d'un crew. Lot 19 : fiche, membres, demandes, invitations. Lot C2b : écran à affiche (`s-crew`).
// Lot R5c2 (maquettes R5.7 et R5.8, décisions de Damien du 26/10) :
// - membre : bannière, logo, nom, « Crew · département · N membres · depuis », description, « Tu es le chef », Instagram ;
//   Discussion (avec ses non-lus), Inviter et Réglages (chef) ; onglets Fil (emplacement du lot R5c1), Sorties (sorties
//   du crew, « Où va le crew »), Garage (carrés), Membres (demandes avec leur message pour le chef, membres, inviter) ;
// - non-membre : la vitrine (image du crew, description, Instagram, amis membres, membres) et « Demander à rejoindre »,
//   qui ouvre la feuille avec un mot pour le chef ; puis « Demande envoyée à … » et « Annuler la demande ».
// Les réglages du chef (logo, bannière, Instagram, sorties, retirer, dissoudre) ont leur écran (`/crew/reglages`).
import {
  departmentChoices,
  Icon,
  initialsOf,
  Photo,
  Tag,
  Text,
  TextField,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import {
  type CrewOutingRsvp,
  type CrewOutingView,
  type CrewView,
  crewInstagramUrl,
  crewLabels,
  crewPageLabels as L,
} from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Linking, Platform, Pressable, StyleSheet, View } from "react-native";

import { CrewRequestSheet } from "@/features/crews/CrewRequestSheet";
import { CrewFeedSlot } from "@/features/crews/page/CrewFeedSlot";
import {
  CrewEventRow,
  CrewSecHead,
  CrewTabs,
  FriendsBox,
  GarageTile,
  InfoBox,
  MemberRow,
  memberCaption,
  OutingCard,
  RequestCard,
  vitrineCaption,
} from "@/features/crews/page/parts";
import { PosterFlow } from "@/features/event/PosterFlow";
import { ReportButton } from "@/features/ReportSheet";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "@/ui/AppSheet";
import { CrewDot, SmButton } from "@/ui/Kit";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";

const { space1, space2, space3 } = tokens.spacing;

type Tab = "feed" | "outings" | "garage" | "members";

/** Confirmation (navigateur : `window.confirm` ; téléphone : boîte de dialogue). */
function ask(message: string): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(window.confirm(message));
  return new Promise((resolve) =>
    Alert.alert(crewLabels.crew, message, [
      { text: "Annuler", style: "cancel", onPress: () => resolve(false) },
      { text: "Confirmer", style: "destructive", onPress: () => resolve(true) },
    ]),
  );
}

export default function CrewScreen() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { slug, onglet } = useLocalSearchParams<{ slug: string; onglet?: string }>();
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
  const [tab, setTab] = useState<Tab>(onglet === "sorties" ? "outings" : "feed");
  const [asking, setAsking] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [invite, setInvite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const close = () => (router.canGoBack() ? router.back() : router.replace("/"));
  const reloadAll = async () => {
    await Promise.all([crew.reload(), members.reload(), pending.reload()]);
  };
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
    return (
      <FlowScreen title={crewLabels.crew} onClose={close}>
        {crew.error ? (
          <Notice tone="error">
            {crew.error.status === 404 ? "Ce crew n'existe pas ou plus." : crew.error.message}
          </Notice>
        ) : (
          <Muted variant="body">Chargement…</Muted>
        )}
      </FlowScreen>
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
  const since = new Date(v.createdAt).getFullYear();
  const friends = v.members.filter((m) => m.friend);
  const requests = pending.data?.requests ?? [];

  const inviteSheet = (
    <AppSheet visible={inviting} onClose={() => setInviting(false)} accessibilityLabel={crewLabels.invite}>
      <Text variant="posterM" color={c.ink}>
        {crewLabels.invite}
      </Text>
      <TextField label={crewLabels.invitePseudo} value={invite} onChangeText={setInvite} autoCapitalize="none" />
      <SmButton
        kind="p"
        big
        wide
        icon="send"
        disabled={busy || !invite.trim()}
        onPress={() =>
          void run(async () => {
            await api.inviteToCrew(v.id, invite.trim());
            setInvite("");
            setInviting(false);
          }, crewLabels.invited(invite.trim()))
        }
        testID="crew-invite-send"
      >
        {crewLabels.invite}
      </SmButton>
      {pending.data && pending.data.invitations.length > 0 ? (
        <Muted variant="caption">
          {crewLabels.pendingInvitations} : {pending.data.invitations.map((i) => i.person.pseudo).join(", ")}
        </Muted>
      ) : null}
    </AppSheet>
  );
  const requestSheet = (
    <CrewRequestSheet
      crew={asking ? { id: v.id, name: v.name, leaderPseudo: v.leader?.pseudo ?? null } : null}
      onClose={() => setAsking(false)}
      onSent={(next) => {
        setAsking(false);
        crew.setData(next);
      }}
    />
  );

  // Pied fixe : la seule action principale de la vitrine (ou annuler la demande envoyée).
  const footer =
    !member && live ? (
      v.viewerState === "none" ? (
        <SmButton kind="p" big wide icon="crew" onPress={() => setAsking(true)} testID="crew-request">
          {L.requestJoin}
        </SmButton>
      ) : v.viewerState === "requested" ? (
        <SmButton
          kind="g"
          big
          wide
          icon="close"
          disabled={busy}
          onPress={() => me && void run(() => api.removeCrewMember(v.id, me.user.id))}
          testID="crew-request-cancel"
        >
          {L.cancelRequest}
        </SmButton>
      ) : null
    ) : undefined;

  return (
    <PosterFlow
      onClose={close}
      onRefresh={reloadAll}
      overlays={
        <>
          {leader ? inviteSheet : null}
          {requestSheet}
        </>
      }
      footer={footer}
      testID="crew-page"
      hero={
        <View style={styles.hero}>
          <Photo
            source={mediaSource(v.bannerUrl)}
            placeholder={`linear-gradient(160deg, ${c.surfaceRaised} 0%, ${c.night} 100%)`}
            style={StyleSheet.absoluteFill}
            accessibilityLabel={v.bannerUrl ? `Bannière de ${v.name}` : undefined}
          />
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Photo
              placeholder={`linear-gradient(180deg, ${c.night}0d 0%, ${c.night}b3 100%)`}
              style={StyleSheet.absoluteFill}
            />
          </View>
        </View>
      }
    >
      {/* `.cr-id` : le rond du crew remonte sur la bannière, nom en grand, « Crew · département · N membres · depuis ». */}
      <View style={styles.id} testID="crew" accessibilityLabel={`${crewLabels.crew} ${v.name}`}>
        <View style={[styles.logoRing, { backgroundColor: c.ground }]}>
          {v.logoUrl ? (
            <View style={styles.logoImg}>
              <Photo source={mediaSource(v.logoUrl)} style={StyleSheet.absoluteFill} />
            </View>
          ) : (
            <CrewDot initials={initialsOf(v.name).slice(0, 2)} size={84} />
          )}
        </View>
        <View style={styles.idText}>
          <Text variant="posterL" color={c.ink} style={styles.name}>
            {v.name}
          </Text>
          <Text variant="caption" color={c.inkMuted}>
            {L.idLine(departmentName(v.department), v.membersCount, since)}
          </Text>
        </View>
      </View>
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
              <InstagramGlyph />
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

      {/* `.r5cact` : Discussion (avec ses non-lus), Inviter et Réglages pour le chef. */}
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
          <CrewTabs<Tab>
            items={[
              { id: "feed", label: L.tabFeed, testID: "crew-tab-feed" },
              { id: "outings", label: L.tabCount(L.tabOutings, space.outings.length), testID: "crew-tab-outings" },
              { id: "garage", label: L.tabGarage, testID: "crew-tab-garage" },
              {
                id: "members",
                label: L.tabCount(L.tabMembers, leader ? requests.length : 0),
                testID: "crew-tab-members",
              },
            ]}
            value={tab}
            onChange={setTab}
          />

          {tab === "feed" ? <CrewFeedSlot crewId={v.id} leader={leader} /> : null}

          {tab === "outings" ? (
            <View style={styles.col} testID="crew-outings">
              {space.canProposeOuting ? (
                <SmButton
                  kind="p"
                  big
                  wide
                  icon="add"
                  onPress={() => router.push({ pathname: "/crew/sortie", params: { crew: v.slug } })}
                  testID="crew-propose-outing"
                >
                  {L.proposeOuting}
                </SmButton>
              ) : (
                <Muted variant="caption" testID="crew-propose-reserved">
                  {L.proposeReserved}
                </Muted>
              )}
              <CrewSecHead title={L.outingsTitle} hint={L.outingsHint} icon="lock" />
              {space.outings.length === 0 ? <Muted variant="body">{L.outingsEmpty}</Muted> : null}
              {space.outings.map((o) => (
                <OutingCard
                  key={o.id}
                  outing={o}
                  busy={busy}
                  onAnswer={(a) => answer(o, a)}
                  onEdit={() => router.push({ pathname: "/crew/sortie", params: { crew: v.slug, sortie: o.id } })}
                  onCancel={() => void cancelOuting(o)}
                />
              ))}
              <CrewSecHead title={L.crewEventsTitle} hint={L.crewEventsHint} />
              {space.events.length === 0 ? <Muted variant="body">{L.crewEventsEmpty}</Muted> : null}
              {space.events.map((e) => (
                <CrewEventRow
                  key={e.slug}
                  event={e}
                  onPress={() =>
                    leader && e.registered > 0
                      ? router.push({ pathname: "/crew/inscription", params: { event: e.slug } })
                      : router.push(`/e/${e.slug}`)
                  }
                />
              ))}
              {leader ? (
                <SmButton
                  kind="s"
                  big
                  wide
                  icon="ticket"
                  onPress={() => router.navigate("/explorer")}
                  testID="crew-register"
                >
                  {L.registerCrew}
                </SmButton>
              ) : null}
            </View>
          ) : null}

          {tab === "garage" ? (
            <View style={styles.col} testID="crew-garage">
              <CrewSecHead title={L.garageTitle} hint={L.garageCount(space.garage.length)} />
              {space.garage.length === 0 ? <Muted variant="body">{L.garageEmpty}</Muted> : null}
              {pairs(space.garage).map((row) => (
                <View key={row.map((g) => g.id).join("-")} style={styles.grid}>
                  {row.map((g) => (
                    <GarageTile key={g.id} vehicle={g} onPress={() => router.push(`/v/${g.id}`)} />
                  ))}
                  {row.length === 1 ? <View style={styles.grow} /> : null}
                </View>
              ))}
            </View>
          ) : null}

          {tab === "members" ? (
            <View style={styles.col} testID="crew-members">
              {leader && requests.length > 0 ? (
                <>
                  <CrewSecHead title={L.requestsTitle} hint={L.requestsHint} />
                  {requests.map((r) => (
                    <RequestCard
                      key={r.person.userId}
                      request={r}
                      busy={busy}
                      onOpen={() => router.push(`/u/${encodeURIComponent(r.person.pseudo)}`)}
                      onAccept={() => void run(() => api.acceptCrewRequest(v.id, r.person.userId))}
                      onDecline={() => void run(() => api.declineCrewRequest(v.id, r.person.userId))}
                    />
                  ))}
                </>
              ) : null}
              <CrewSecHead title={L.membersTitle} hint={String(members.data?.length ?? v.membersCount)} />
              {(members.data ?? []).map((m) => (
                <MemberRow
                  key={m.userId}
                  pseudo={m.pseudo}
                  avatarUrl={m.avatarUrl}
                  caption={memberCaption(m)}
                  leader={m.role === "leader"}
                  onPress={() => router.push(`/u/${encodeURIComponent(m.pseudo)}`)}
                />
              ))}
              {leader ? (
                <SmButton kind="s" big wide icon="add" onPress={() => setInviting(true)} testID="crew-invite-someone">
                  {L.inviteSomeone}
                </SmButton>
              ) : null}
              {v.viewerState === "member" ? (
                <SmButton
                  kind="g"
                  icon="undo"
                  disabled={busy}
                  onPress={async () => {
                    if (!me || !(await ask(crewLabels.leaveConfirm))) return;
                    void run(() => api.removeCrewMember(v.id, me.user.id));
                  }}
                  testID="crew-leave"
                >
                  {crewLabels.leave}
                </SmButton>
              ) : null}
            </View>
          ) : null}
        </>
      ) : null}

      {/* Vitrine (R5.8, sans le garage : décision de Damien) : amis membres, membres, ce qui est réservé, la demande. */}
      {!member ? (
        <View style={styles.col} testID="crew-vitrine">
          <FriendsBox friends={friends} />
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
          <InfoBox
            icon="lock"
            title={L.membersOnly}
            caption={L.leaderAccepts(v.leader?.pseudo ?? null)}
            testID="crew-members-only"
          />
          {v.viewerState === "requested" ? (
            <InfoBox
              icon="check"
              tone="accent"
              title={L.requestSentTo(v.leader?.pseudo ?? null)}
              caption={L.requestSentHint}
              testID="crew-request-sent"
            />
          ) : null}
          {v.viewerState === "invited" && live ? (
            <View style={styles.actions}>
              <SmButton
                kind="s"
                big
                icon="check"
                style={styles.grow}
                disabled={busy}
                onPress={() => void run(() => api.acceptCrewInvitation(v.id))}
                testID="crew-invitation-accept"
              >
                {crewLabels.acceptInvitation}
              </SmButton>
              <SmButton
                kind="g"
                big
                icon="close"
                disabled={busy}
                onPress={() => void run(() => api.declineCrewInvitation(v.id))}
              >
                {crewLabels.declineInvitation}
              </SmButton>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Signaler (lot 32) : un crew dont on n'est pas le chef. */}
      {!leader && live ? <ReportButton look="link" type="crew" id={v.id} /> : null}
    </PosterFlow>
  );
}

/** Le garage en deux colonnes. */
function pairs<T>(items: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 2) out.push(items.slice(i, i + 2));
  return out;
}

/** « Crew · Pyrénées-Orientales · … » (maquette R5.7) : le nom du département, son numéro s'il est inconnu. */
function departmentName(code: string): string {
  return departmentChoices.find((d) => d.code === code)?.name ?? code;
}

/** Glyphe Instagram du kit, à la taille de la pastille `.r5sc`. */
function InstagramGlyph() {
  const { t } = useTheme();
  return <Icon name="instagram" size={16} color={t.color.ink} />;
}

const styles = StyleSheet.create({
  hero: { height: 190, width: "100%" },
  // Le nom commence sous la bannière (maquette `.cr-id .stack` : padding-top 48 px, plus l'anneau du logo) : sur une
  // photo de bannière, l'encre du thème Sable ne se lirait pas.
  id: { flexDirection: "row", alignItems: "flex-start", gap: space3 + 2, marginTop: -46 },
  logoRing: { borderRadius: 46, padding: 4 },
  logoImg: { width: 84, height: 84, borderRadius: 42, overflow: "hidden" },
  idText: { flex: 1, minWidth: 0, gap: space1, paddingTop: 50, paddingBottom: space1 },
  name: { fontSize: 24, lineHeight: 23 },
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
  col: { gap: space3 },
  grid: { flexDirection: "row", gap: 10 },
});
