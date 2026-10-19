// Fiche d'un crew (lot 19, ARCHITECTURE-SUITE § 4.4) : nom, logo, description, département, chef et nombre de membres
// pour toute personne connectée ; membres et discussion pour les membres (S16) ; demandes, invitations, logo et
// dissolution pour le chef. Inscrire le crew à un événement : depuis la page de l'événement (« Inscrire mon crew »).
import { Button, Chip, Plate, Text, TextField, tokens, useTheme } from "@orasso/design-system/native";
import { CREW_REQUEST_MESSAGE_MAX, crewLabels, gradeLabels } from "@orasso/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Platform, Pressable, StyleSheet, View } from "react-native";

import { CrewLogo } from "@/features/crews/CrewLogo";
import { ReportButton } from "@/features/ReportSheet";
import { api } from "@/lib/api";
import { pickAvatar } from "@/lib/avatar";
import { errorMessage } from "@/lib/http";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { Avatar } from "@/ui/Avatar";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { FlowScreen, SectionTitle } from "@/ui/Screens";

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

  return (
    <FlowScreen title={v.name} onClose={close} onRefresh={reloadAll}>
      <Plate style={styles.head} testID="crew" accessibilityLabel={`${crewLabels.crew} ${v.name}`}>
        <View style={styles.headRow}>
          <CrewLogo url={v.logoUrl} name={v.name} size={72} />
          <View style={styles.headText}>
            <Text variant="posterL" color={c.plateInk}>
              {v.name}
            </Text>
            <View style={styles.chips}>
              <Chip surface="plate">{v.department}</Chip>
              <Chip surface="plate">{crewLabels.membersCount(v.membersCount)}</Chip>
              {leader ? (
                <Chip variant="accent" surface="plate">
                  {crewLabels.leader}
                </Chip>
              ) : null}
            </View>
            {v.leader ? (
              <Text variant="caption" color={c.plateMuted}>
                {crewLabels.leaderOf(v.leader.pseudo)}
              </Text>
            ) : null}
          </View>
        </View>
        {v.description ? (
          <Text variant="body" color={c.plateInk}>
            {v.description}
          </Text>
        ) : null}
      </Plate>

      {v.archived ? <Notice>{crewLabels.archived}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      {ok ? <Notice>{ok}</Notice> : null}

      {!v.archived && v.viewerState === "none" ? (
        <View style={styles.block}>
          <TextField
            label={crewLabels.requestMessage}
            value={message}
            onChangeText={setMessage}
            maxLength={CREW_REQUEST_MESSAGE_MAX}
            multiline
          />
          <Button
            icon="crew"
            loading={busy}
            fullWidth
            testID="crew-request"
            onPress={() =>
              void run(() => api.requestCrew(v.id, message.trim() || null), crewLabels.requestSentTo(v.name))
            }
          >
            {crewLabels.requestJoin}
          </Button>
        </View>
      ) : null}
      {v.viewerState === "requested" ? (
        <Button variant="secondary" icon="wait" disabled fullWidth>
          {crewLabels.requestSent}
        </Button>
      ) : null}
      {v.viewerState === "invited" ? (
        <View style={styles.row}>
          <Button icon="check" loading={busy} onPress={() => void run(() => api.acceptCrewInvitation(v.id))}>
            {crewLabels.acceptInvitation}
          </Button>
          <Button
            variant="secondary"
            icon="close"
            disabled={busy}
            onPress={() => void run(() => api.declineCrewInvitation(v.id))}
          >
            {crewLabels.declineInvitation}
          </Button>
        </View>
      ) : null}
      {member && v.conversationId ? (
        <Button
          variant={leader ? "secondary" : "primary"}
          icon="chat"
          fullWidth
          testID="crew-discussion"
          onPress={() => router.push(`/boite/${v.conversationId}`)}
        >
          {crewLabels.openDiscussion}
        </Button>
      ) : null}
      {!member ? <Muted variant="caption">{crewLabels.membersPrivate}</Muted> : null}

      {leader && pending.data ? (
        <>
          <SectionTitle>{crewLabels.pendingRequests}</SectionTitle>
          {pending.data.requests.length === 0 ? <Muted variant="body">{crewLabels.noPending}</Muted> : null}
          {pending.data.requests.map((r) => (
            <Plate key={r.person.userId} style={styles.person} testID="crew-pending-request">
              <Pressable
                style={styles.personRow}
                onPress={() => router.push(`/u/${encodeURIComponent(r.person.pseudo)}`)}
              >
                <Avatar url={r.person.avatarUrl} pseudo={r.person.pseudo} size={36} />
                <Text variant="bodyStrong" color={c.plateInk}>
                  {r.person.pseudo}
                </Text>
              </Pressable>
              {r.message ? (
                <Text variant="body" color={c.plateMuted}>
                  {r.message}
                </Text>
              ) : null}
              <View style={styles.row}>
                <Button
                  variant="plate"
                  icon="check"
                  disabled={busy}
                  onPress={() => void run(() => api.acceptCrewRequest(v.id, r.person.userId))}
                >
                  {crewLabels.accept}
                </Button>
                <Button
                  variant="plate"
                  tone="dashed"
                  icon="close"
                  disabled={busy}
                  onPress={() => void run(() => api.declineCrewRequest(v.id, r.person.userId))}
                >
                  {crewLabels.decline}
                </Button>
              </View>
            </Plate>
          ))}
          <View style={styles.block}>
            <TextField label={crewLabels.invitePseudo} value={invite} onChangeText={setInvite} autoCapitalize="none" />
            <Button
              variant="secondary"
              icon="add"
              disabled={busy || !invite.trim()}
              onPress={() =>
                void run(async () => {
                  await api.inviteToCrew(v.id, invite.trim());
                  setInvite("");
                }, crewLabels.invited(invite.trim()))
              }
            >
              {crewLabels.invite}
            </Button>
          </View>
          {pending.data.invitations.length > 0 ? (
            <Muted variant="caption">
              {crewLabels.pendingInvitations} : {pending.data.invitations.map((i) => i.person.pseudo).join(", ")}
            </Muted>
          ) : null}
        </>
      ) : null}

      {members.data ? (
        <>
          <SectionTitle>{crewLabels.members}</SectionTitle>
          {members.data.map((m) => (
            <Plate key={m.userId} style={styles.person} testID="crew-member">
              <Pressable style={styles.personRow} onPress={() => router.push(`/u/${encodeURIComponent(m.pseudo)}`)}>
                <Avatar url={m.avatarUrl} pseudo={m.pseudo} size={36} />
                <View style={styles.headText}>
                  <Text variant="bodyStrong" color={c.plateInk}>
                    {m.pseudo}
                  </Text>
                  <Text variant="caption" color={c.plateMuted}>
                    {gradeLabels[m.grade]}
                    {m.role === "leader" ? ` · ${crewLabels.leader}` : ""}
                  </Text>
                </View>
              </Pressable>
              {leader && m.role !== "leader" && !v.archived ? (
                <Button
                  variant="plate"
                  tone="dashed"
                  icon="close"
                  disabled={busy}
                  onPress={async () => {
                    if (await ask(crewLabels.removeConfirm(m.pseudo)))
                      void run(() => api.removeCrewMember(v.id, m.userId));
                  }}
                >
                  {crewLabels.remove}
                </Button>
              ) : null}
            </Plate>
          ))}
        </>
      ) : null}

      {leader && !v.archived ? (
        <>
          <SectionTitle>{crewLabels.edit}</SectionTitle>
          <View style={styles.row}>
            <Button
              variant="secondary"
              icon="add"
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
            </Button>
            {v.logoUrl ? (
              <Button
                variant="secondary"
                icon="close"
                disabled={busy}
                onPress={() => void run(() => api.setCrewLogo(v.id, null))}
              >
                {crewLabels.removeLogo}
              </Button>
            ) : null}
          </View>
          <Button
            variant="secondary"
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
          </Button>
          <Muted variant="caption">{crewLabels.leaderCannotLeave}</Muted>
        </>
      ) : null}

      {v.viewerState === "member" && !v.archived ? (
        <Button
          variant="secondary"
          icon="undo"
          disabled={busy}
          onPress={async () => {
            if (!me || !(await ask(crewLabels.leaveConfirm))) return;
            void run(() => api.removeCrewMember(v.id, me.user.id));
          }}
        >
          {crewLabels.leave}
        </Button>
      ) : null}
      {/* Signaler (lot 32) : un crew dont on n'est pas le chef. */}
      {!leader && !v.archived ? <ReportButton look="link" type="crew" id={v.id} /> : null}
    </FlowScreen>
  );
}

const styles = StyleSheet.create({
  head: { gap: space3, padding: space3 },
  headRow: { flexDirection: "row", alignItems: "center", gap: space3 },
  headText: { flex: 1, gap: space1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  block: { gap: space2 },
  person: { gap: space2, padding: space3 },
  personRow: { flexDirection: "row", alignItems: "center", gap: space3 },
});
