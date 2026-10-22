// Fiche d'un crew (lot 19, ARCHITECTURE-SUITE § 4.4) : nom, logo, description, département, chef et nombre de membres
// pour toute personne connectée ; membres et discussion pour les membres (S16) ; demandes, invitations, logo et
// dissolution pour le chef.
// Lot C2b (artefact `s-crew`) : écran à affiche (image en tête, rond du crew qui remonte dessus), étiquettes, action
// principale « Inscrire le crew » (le chef choisit un événement ; la feuille de candidature a le mode « Avec <crew> »)
// avec discussion et invitation en boutons carrés, rail des membres, « Demandes · Toi seul les vois ». « Sorties
// ensemble » et « Le garage du crew » attendent les données de l'API (lot C5, consigné au journal). La gestion du chef
// (retirer, logo, dissoudre) reste, rangée en bas.
import { initialsOf, Photo, Tag, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { CREW_REQUEST_MESSAGE_MAX, crewLabels, gradeLabels } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";

import { PosterFlow } from "@/features/event/PosterFlow";
import { CrewDot, SmButton } from "@/features/passionne/kit";
import { ReportButton } from "@/features/ReportSheet";
import { api } from "@/lib/api";
import { useApplications } from "@/lib/applications";
import { pickAvatar } from "@/lib/avatar";
import { errorMessage } from "@/lib/http";
import { mediaSource } from "@/lib/media";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "@/ui/AppSheet";
import { Avatar } from "@/ui/Avatar";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen } from "@/ui/Screens";
import { SecHead } from "@/ui/SecHead";

const { space1, space2, space3 } = tokens.spacing;

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
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { me } = useSession();
  const crew = useApi(() => api.crewBySlug(slug), [slug]);
  const v = crew.data;
  const member = v?.viewerState === "member" || v?.viewerState === "leader";
  const leader = v?.viewerState === "leader";
  const members = useApi(() => api.crewMembers(v?.id ?? ""), [v?.id, member], { enabled: Boolean(v && member) });
  const pending = useApi(() => api.crewPending(v?.id ?? ""), [v?.id, leader], {
    enabled: Boolean(v && leader && !v.archived),
  });
  const [message, setMessage] = useState("");
  const [invite, setInvite] = useState("");
  const [inviting, setInviting] = useState(false);
  // Relecture C2b : le suivi des inscriptions du crew (confirmations, retrait d'un membre en attente) reste joignable
  // depuis la page du crew, pour chaque événement à venir où le crew est inscrit avec moi.
  const { upcoming } = useApplications();
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

  const since = new Date(v.createdAt).getFullYear();
  const registrations = leader
    ? [...new Map((upcoming ?? []).filter((a) => a.crew?.id === v.id).map((a) => [a.event.slug, a.event])).values()]
    : [];
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

  return (
    <PosterFlow
      onClose={close}
      onRefresh={reloadAll}
      overlays={leader ? inviteSheet : null}
      testID="crew-page"
      hero={
        <View style={styles.hero}>
          <Photo
            source={mediaSource(v.logoUrl)}
            placeholder={`linear-gradient(160deg, ${c.surfaceRaised} 0%, ${c.night} 100%)`}
            style={StyleSheet.absoluteFill}
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
      {/* `.cr-id` : le rond du crew remonte sur l'image, nom en grand, « Crew · département · membres · depuis ». */}
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
            {[crewLabels.crew, v.department, crewLabels.membersCount(v.membersCount), `depuis ${since}`].join(" · ")}
          </Text>
        </View>
      </View>
      <View style={styles.tags}>
        {leader ? <Tag tone="acc">Tu es responsable</Tag> : null}
        {v.leader && !leader ? <Tag tone="line">{crewLabels.leaderOf(v.leader.pseudo)}</Tag> : null}
      </View>
      {v.description ? (
        <Text variant="body" color={c.inkMuted}>
          {v.description}
        </Text>
      ) : null}

      {v.archived ? <Notice>{crewLabels.archived}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {ok ? <Notice>{ok}</Notice> : null}

      {member && !v.archived ? (
        <View style={styles.actions}>
          {leader ? (
            <SmButton
              kind="p"
              big
              icon="ticket"
              style={styles.grow}
              onPress={() => router.navigate("/explorer")}
              testID="crew-register"
            >
              {crewLabels.registerCrewSend}
            </SmButton>
          ) : null}
          {v.conversationId ? (
            <SmButton
              kind={leader ? "s" : "p"}
              big
              icon="chat"
              style={leader ? undefined : styles.grow}
              onPress={() => router.push(`/boite/${v.conversationId}`)}
              accessibilityLabel={crewLabels.openDiscussion}
              testID="crew-discussion"
            >
              {leader ? undefined : crewLabels.openDiscussion}
            </SmButton>
          ) : null}
          {leader ? (
            <SmButton
              kind="s"
              big
              icon="share"
              onPress={() => setInviting(true)}
              accessibilityLabel="Inviter dans le crew"
              testID="crew-invite"
            />
          ) : null}
        </View>
      ) : null}

      {registrations.map((ev) => (
        <SmButton
          key={ev.slug}
          kind="g"
          icon="list"
          onPress={() => router.push({ pathname: "/crew/inscription", params: { event: ev.slug } })}
          testID="crew-registration-link"
        >
          {`Inscription du crew · ${ev.title}`}
        </SmButton>
      ))}

      {!v.archived && v.viewerState === "none" ? (
        <View style={styles.block}>
          <TextField
            label={crewLabels.requestMessage}
            value={message}
            onChangeText={setMessage}
            maxLength={CREW_REQUEST_MESSAGE_MAX}
            multiline
          />
          <SmButton
            kind="p"
            big
            wide
            icon="staff"
            disabled={busy}
            testID="crew-request"
            onPress={() =>
              void run(() => api.requestCrew(v.id, message.trim() || null), crewLabels.requestSentTo(v.name))
            }
          >
            {crewLabels.requestJoin}
          </SmButton>
        </View>
      ) : null}
      {v.viewerState === "requested" ? (
        <SmButton kind="s" big wide icon="wait" disabled>
          {crewLabels.requestSent}
        </SmButton>
      ) : null}
      {v.viewerState === "invited" ? (
        <View style={styles.actions}>
          <SmButton
            kind="p"
            big
            icon="check"
            style={styles.grow}
            disabled={busy}
            onPress={() => void run(() => api.acceptCrewInvitation(v.id))}
          >
            {crewLabels.acceptInvitation}
          </SmButton>
          <SmButton
            kind="s"
            big
            icon="close"
            disabled={busy}
            onPress={() => void run(() => api.declineCrewInvitation(v.id))}
          >
            {crewLabels.declineInvitation}
          </SmButton>
        </View>
      ) : null}
      {!member ? <Muted variant="caption">{crewLabels.membersPrivate}</Muted> : null}

      {/* `.cr-members` : rail des membres (rond, pseudo, grade ; « Responsable » pour le chef). */}
      {members.data ? (
        <>
          <SecHead title={crewLabels.members} hint={crewLabels.membersCount(members.data.length)} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
            {members.data.map((m) => (
              <Pressable
                key={m.userId}
                accessibilityRole="link"
                accessibilityLabel={m.pseudo}
                onPress={() => router.push(`/u/${encodeURIComponent(m.pseudo)}`)}
                style={styles.member}
                testID="crew-member"
              >
                <Avatar url={m.avatarUrl} pseudo={m.pseudo} size={54} />
                <Text variant="bodyStrong" color={c.ink} style={styles.memberName} numberOfLines={1}>
                  {m.pseudo}
                </Text>
                <Text variant="caption" color={c.inkMuted} style={styles.memberSub}>
                  {gradeLabels[m.grade]}
                </Text>
                {m.role === "leader" ? <Tag tone="acc">Responsable</Tag> : null}
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}

      {/* Demandes : « Toi seul les vois » ; Accepter en petit bouton, Refuser en fantôme. */}
      {leader && pending.data && pending.data.requests.length > 0 ? (
        <>
          <SecHead title="Demandes" hint="Toi seul les vois" />
          {pending.data.requests.map((r) => (
            <View
              key={r.person.userId}
              style={[styles.item, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]}
              testID="crew-pending-request"
            >
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={r.person.pseudo}
                onPress={() => router.push(`/u/${encodeURIComponent(r.person.pseudo)}`)}
              >
                <Avatar url={r.person.avatarUrl} pseudo={r.person.pseudo} size={40} />
              </Pressable>
              <View style={styles.grow}>
                <Text variant="bodyStrong" color={c.ink}>
                  {r.person.pseudo}
                </Text>
                <Text variant="caption" color={c.inkMuted}>
                  {[gradeLabels[r.person.grade], r.message ?? "veut rejoindre"].join(" · ")}
                </Text>
              </View>
              <View style={styles.itemActions}>
                <SmButton
                  kind="s"
                  icon="check"
                  disabled={busy}
                  onPress={() => void run(() => api.acceptCrewRequest(v.id, r.person.userId))}
                >
                  {crewLabels.accept}
                </SmButton>
                <SmButton
                  kind="g"
                  icon="close"
                  disabled={busy}
                  accessibilityLabel={crewLabels.decline}
                  onPress={() => void run(() => api.declineCrewRequest(v.id, r.person.userId))}
                />
              </View>
            </View>
          ))}
        </>
      ) : null}

      {/* Gérer le crew (chef) : retirer un membre, logo, dissolution ; hors de l'artefact, rangé en bas. */}
      {leader && !v.archived ? (
        <>
          <SecHead title={crewLabels.edit} />
          {(members.data ?? [])
            .filter((m) => m.role !== "leader")
            .map((m) => (
              <View key={m.userId} style={[styles.item, { backgroundColor: c.surface }]}>
                <Avatar url={m.avatarUrl} pseudo={m.pseudo} size={32} />
                <Text variant="bodyStrong" color={c.ink} style={styles.grow}>
                  {m.pseudo}
                </Text>
                <SmButton
                  kind="g"
                  icon="close"
                  disabled={busy}
                  onPress={async () => {
                    if (await ask(crewLabels.removeConfirm(m.pseudo)))
                      void run(() => api.removeCrewMember(v.id, m.userId));
                  }}
                >
                  {crewLabels.remove}
                </SmButton>
              </View>
            ))}
          <View style={styles.actions}>
            <SmButton
              kind="s"
              icon="gallery"
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  const picked = await pickAvatar();
                  if (!picked) return;
                  const form = new FormData();
                  form.append("purpose", "crew_logo");
                  if (Platform.OS === "web") {
                    const blob = await (await fetch(picked.uri)).blob();
                    form.append("file", new File([blob], "logo.jpg", { type: "image/jpeg" }));
                  } else {
                    form.append("file", { uri: picked.uri, name: "logo.jpg", type: "image/jpeg" } as unknown as Blob);
                  }
                  const { key } = await api.upload(form);
                  await api.setCrewLogo(v.id, key);
                }, crewLabels.saved)
              }
            >
              {crewLabels.changeLogo}
            </SmButton>
            {v.logoUrl ? (
              <SmButton
                kind="s"
                icon="close"
                disabled={busy}
                onPress={() => void run(() => api.setCrewLogo(v.id, null))}
              >
                {crewLabels.removeLogo}
              </SmButton>
            ) : null}
            <SmButton
              kind="g"
              icon="close"
              disabled={busy}
              onPress={async () => {
                if (!(await ask(crewLabels.archiveConfirm))) return;
                void run(async () => {
                  await api.archiveCrew(v.id);
                  router.replace("/(tabs)/garage");
                });
              }}
            >
              {crewLabels.archive}
            </SmButton>
          </View>
          <Muted variant="caption">{crewLabels.leaderCannotLeave}</Muted>
        </>
      ) : null}

      {v.viewerState === "member" && !v.archived ? (
        <SmButton
          kind="g"
          icon="undo"
          disabled={busy}
          onPress={async () => {
            if (!me || !(await ask(crewLabels.leaveConfirm))) return;
            void run(() => api.removeCrewMember(v.id, me.user.id));
          }}
        >
          {crewLabels.leave}
        </SmButton>
      ) : null}
      {/* Signaler (lot 32) : un crew dont on n'est pas le chef. */}
      {!leader && !v.archived ? <ReportButton look="link" type="crew" id={v.id} /> : null}
    </PosterFlow>
  );
}

const styles = StyleSheet.create({
  hero: { height: 200, width: "100%" },
  id: { flexDirection: "row", alignItems: "flex-end", gap: space3 + 2, marginTop: -42 },
  logoRing: { borderRadius: 46, padding: 4 },
  logoImg: { width: 84, height: 84, borderRadius: 42, overflow: "hidden" },
  idText: { flex: 1, minWidth: 0, gap: space1, paddingBottom: space1 },
  name: { fontSize: 24, lineHeight: 23 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "stretch", gap: space2 },
  grow: { flex: 1, minWidth: 0 },
  block: { gap: space2 },
  rail: { gap: space2, paddingVertical: space1, paddingHorizontal: 2 },
  member: { width: 92, alignItems: "center", gap: 3 },
  memberName: { fontSize: 12, fontFamily: "Archivo-ExtraBold", textAlign: "center" },
  memberSub: { fontSize: 10.5, lineHeight: 13, textAlign: "center" },
  item: { flexDirection: "row", alignItems: "center", gap: space3, padding: space3, borderRadius: 16 },
  itemActions: { flexDirection: "row", alignItems: "center", gap: space1 },
});
