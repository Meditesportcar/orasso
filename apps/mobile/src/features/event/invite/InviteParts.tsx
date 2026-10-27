// Lot R6c (maquettes R6.3 et R6.6) : sur la fiche d'un événement, le bloc « Qui y va » (les personnes que je suis qui y
// vont, trois visages) avec « Inviter du monde », et le bandeau « Kenji_66 t'invite » de la personne invitée, dont le
// « ⋯ » ouvre le menu d'une invitation (couper ses invitations, réglages des invitations, signaler). Les règles sont
// dans l'API (`modules/event-invites`) ; l'écran affiche ce qu'elle renvoie.
import { Icon, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  eventInvitedBanner,
  type FollowingGoing,
  followingGoingText,
  inviteNoteLines,
  inviterNames,
  eventInviteLabels as L,
  type ReceivedEventInvitation,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { openReport } from "@/features/ReportSheet";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/http";
import { useApi } from "@/lib/useApi";
import { AppSheet } from "@/ui/AppSheet";
import { Avatar } from "@/ui/Avatar";
import { SmButton } from "@/ui/Kit";

const { space1, space2, space3 } = tokens.spacing;

/** Visages qui se chevauchent (`.tz-avs`). */
function Faces({ people, size = 30 }: { people: { pseudo: string; avatarUrl: string | null }[]; size?: number }) {
  const { t } = useTheme();
  return (
    <View style={styles.faces}>
      {people.map((p, i) => (
        <View
          key={p.pseudo}
          style={[styles.face, { marginLeft: i === 0 ? 0 : -8, borderColor: t.color.surface, borderRadius: size }]}
        >
          <Avatar url={p.avatarUrl} pseudo={p.pseudo} size={size} />
        </View>
      ))}
    </View>
  );
}

/** `.r6who` : « Qui y va · parmi ceux que tu suis », les visages, « Inviter du monde », et la note sur les places. */
export function WhoGoes({ going, onInvite }: { going: FollowingGoing | null; onInvite: () => void }) {
  const { t } = useTheme();
  const c = t.color;
  const shown = going && going.total > 0 ? going : null;
  return (
    <View style={styles.col}>
      <View style={[styles.who, { backgroundColor: c.surface, boxShadow: t.shadow.shadowCard }]} testID="who-goes">
        {shown ? (
          <>
            <View style={styles.whoHead}>
              <Text variant="label" color={c.inkMuted}>
                {L.whoGoes}
              </Text>
              <Text variant="caption" color={c.inkMuted}>
                {L.whoGoesHint}
              </Text>
            </View>
            <View style={styles.whoRow} testID="who-goes-people">
              <Faces people={shown.people} />
              <Text variant="body" color={c.ink} style={styles.grow}>
                {followingGoingText(
                  shown.people.map((p) => p.pseudo),
                  shown.total,
                )}
              </Text>
            </View>
          </>
        ) : null}
        <SmButton
          kind="s"
          big
          wide
          icon="send"
          onPress={onInvite}
          accessibilityLabel={L.inviteA11y}
          testID="invite-open"
        >
          {L.invite}
        </SmButton>
      </View>
      <View style={styles.note}>
        <Icon name="info" size={16} color={c.inkMuted} />
        <Text variant="caption" color={c.inkMuted} style={styles.grow}>
          {L.noPlace}
        </Text>
      </View>
    </View>
  );
}

/** `.r6inv` : « Kenji_66 t'invite » et son mot, en haut de la fiche ; « ⋯ » ouvre le menu de l'invitation. */
export function InviteBanner({ invitation, onMore }: { invitation: ReceivedEventInvitation; onMore: () => void }) {
  const { t } = useTheme();
  const c = t.color;
  const first = invitation.inviters[0];
  if (!first) return null;
  return (
    <View style={[styles.banner, { backgroundColor: c.accentSoft }]} testID="invite-banner">
      <Avatar url={first.avatarUrl} pseudo={first.pseudo} size={40} />
      <View style={styles.grow}>
        <Text variant="bodyStrong" color={c.ink}>
          {eventInvitedBanner(
            invitation.inviters.map((i) => i.pseudo),
            invitation.inviters.length,
          )}
        </Text>
        {/* Tour 2 (relecture Opus 7) : chaque mot est attribué à son auteur quand plusieurs personnes invitent. */}
        {inviteNoteLines(invitation.inviters).map((line) => (
          <Text key={line} variant="caption" color={c.ink} style={styles.quote}>
            {line}
          </Text>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={L.moreA11y}
        onPress={onMore}
        hitSlop={8}
        style={styles.more}
        testID="invite-banner-more"
      >
        <Icon name="more" size={22} color={c.ink} />
      </Pressable>
    </View>
  );
}

/**
 * Menu d'une invitation (R6.6) : « Ne plus recevoir d'invitations de Kenji_66 » (ou les recevoir de nouveau),
 * « Réglages des invitations » (Réglages › Notifications), « Signaler ». La personne coupée n'en sait rien.
 * Tour 2 (relecture Opus 5) : une invitation regroupée propose de couper, et de signaler, chacun de ses auteurs.
 */
export function InvitationMenu({
  from,
  onClose,
  onChanged,
}: {
  from: { userId: string; pseudo: string }[] | null;
  onClose: () => void;
  onChanged?: (muted: boolean) => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const authors = from ?? [];
  const open = authors.length > 0;
  const key = authors.map((a) => a.userId).join(",");
  const mutes = useApi(() => api.invitationMutes(), [key], { enabled: open });
  const isMuted = (userId: string) => Boolean(mutes.data?.some((m) => m.userId === userId));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const close = () => {
    setMessage(null);
    onClose();
  };
  async function toggle(who: { userId: string; pseudo: string }) {
    const muted = isMuted(who.userId);
    setBusy(true);
    setMessage(null);
    try {
      if (muted) await api.unmuteInvitations(who.userId);
      else await api.muteInvitations(who.userId);
      await mutes.reload();
      setMessage(muted ? L.unmuted(who.pseudo) : L.muted(who.pseudo));
      onChanged?.(!muted);
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const names = inviterNames(
    authors.map((a) => a.pseudo),
    authors.length,
  );
  const row = (icon: "bell" | "gear" | "flag", title: string, hint: string | null, onPress: () => void, id: string) => (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      style={[styles.setRow, { borderColor: c.line }]}
      testID={id}
    >
      <Icon name={icon} size={20} color={c.ink} />
      <View style={styles.grow}>
        <Text variant="bodyStrong" color={c.ink}>
          {title}
        </Text>
        {hint ? (
          <Text variant="caption" color={c.inkMuted}>
            {hint}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
  return (
    <AppSheet visible={open} onClose={close} accessibilityLabel={open ? L.menuTitle(names) : ""}>
      {open ? (
        <View style={styles.col} testID="invite-menu">
          <Text variant="posterM" color={c.ink}>
            {L.menuTitle(names)}
          </Text>
          {authors.map((a) => (
            <View key={a.userId}>
              {row(
                "bell",
                isMuted(a.userId) ? L.unmute(a.pseudo) : L.mute(a.pseudo),
                L.muteHint,
                () => void toggle(a),
                "invite-mute",
              )}
            </View>
          ))}
          {row(
            "gear",
            L.settings,
            L.settingsHint,
            () => {
              close();
              router.push("/reglages/notifications");
            },
            "invite-settings",
          )}
          {authors.map((a) => (
            <View key={`report-${a.userId}`}>
              {row(
                "flag",
                authors.length > 1 ? L.reportWho(a.pseudo) : L.report,
                null,
                () => {
                  close();
                  openReport({ type: "profile", id: a.userId });
                },
                "invite-report",
              )}
            </View>
          ))}
          {message ? (
            <Text variant="caption" color={c.inkMuted} accessibilityRole="alert" testID="invite-menu-message">
              {message}
            </Text>
          ) : null}
        </View>
      ) : null}
    </AppSheet>
  );
}

const styles = StyleSheet.create({
  col: { gap: space2 },
  grow: { flex: 1, minWidth: 0 },
  faces: { flexDirection: "row", paddingLeft: 6 },
  face: { borderWidth: 2, overflow: "hidden" },
  who: { gap: 10, padding: 14, borderRadius: 18 },
  whoHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: space1 },
  whoRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  note: { flexDirection: "row", gap: space1, alignItems: "flex-start", paddingHorizontal: 2 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 16,
  },
  quote: { fontStyle: "italic" },
  more: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  setRow: { flexDirection: "row", alignItems: "center", gap: space3, paddingVertical: space2, borderBottomWidth: 1 },
});
