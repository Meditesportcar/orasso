// Casquette Organisateur, onglet Staff = écran Équipe (lot 22, puis lot 35a / décision D20 : tout se gère depuis l'appli).
// En tête, les demandes pour devenir staff (« Accepter » avec les rôles, « Refuser »), puis les membres (rôles, droit de
// trancher, retrait avec confirmation), l'invitation, et les liens vers la structure, les bannissements, les modèles de
// message et les notes internes. Plus bas, pour un événement : présences, relances, rôles de l'événement, et « passer
// en mode staff ». Mêmes règles et mêmes mots que la page Staff du site ; les droits sont ceux de l'API.
import { Button, Chip, Counters, Plate, SelectField, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type EventCard,
  type EventStaffMember,
  orgaManageLabels as L,
  orgaLabels,
  type StaffRole,
  type StructureMember,
  staffPresenceLabels,
  staffRoleLabels,
  structureRoleLabels,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { canRemind, groupEvents, isTwoFactorError, pickCurrentEvent, rolesChanged, staffSummary } from "@/lib/orga";
import { useSession } from "@/lib/session";
import { emitTeamChanged } from "@/lib/teamBadge";
import { canManageMember, isSuspended, memberGroups, myRoleIn } from "@/lib/teamModel";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { AppSheet } from "@/ui/AppSheet";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { SectionTitle, TabScreen } from "@/ui/Screens";
import { ConfirmSheet } from "./ConfirmSheet";
import { OrgaFailure, useOrga } from "./OrgaGate";
import { failWith } from "./team/fail";
import { RolePicker } from "./team/RolePicker";
import { AcceptSheet, InviteSheet, MemberSheet } from "./team/TeamSheets";

const { space1, space2, space3 } = tokens.spacing;

/** Un membre du staff d'un événement : présence, rôles, relance. */
function EventMemberRow({
  member,
  remindable,
  busy,
  onRemind,
  onRoles,
}: {
  member: EventStaffMember;
  remindable: boolean;
  busy: boolean;
  onRemind: () => void;
  onRoles: () => void;
}) {
  const { t } = useTheme();
  const c = t.color;
  const never = member.presence === "unknown" && member.reminderCount > 0;
  return (
    <Plate style={styles.block} testID="orga-staff-member">
      <View style={styles.head}>
        <Text variant="bodyStrong" color={c.plateInk} style={styles.grow}>
          {member.pseudo}
        </Text>
        <Chip surface="plate" variant={member.presence === "present" ? "accent" : "default"}>
          {staffPresenceLabels[member.presence]}
        </Chip>
      </View>
      <Text variant="caption" color={c.plateMuted}>
        {member.roles.map((r) => staffRoleLabels[r]).join(" · ") || L.teamRolesNone}
        {member.rolesOverride ? ` (${L.eventRolesAdjustedShort})` : ""}
      </Text>
      {never ? (
        <Text variant="caption" color={c.plateInk}>
          {orgaLabels.staffNever} ·{" "}
          {member.reminderCount === 1 ? orgaLabels.staffRemindedOnce : orgaLabels.staffReminded(member.reminderCount)}
        </Text>
      ) : null}
      <View style={styles.buttons}>
        {member.presence === "unknown" ? (
          <Button
            variant="plate"
            icon="bell"
            disabled={!remindable || busy}
            loading={busy}
            onPress={onRemind}
            style={styles.grow}
            testID="orga-staff-remind"
          >
            {orgaLabels.staffRemind}
          </Button>
        ) : null}
        <Button variant="plate" icon="staff" onPress={onRoles} style={styles.grow}>
          {orgaLabels.staffRolesButton}
        </Button>
      </View>
    </Plate>
  );
}

/** Une ligne d'accès à un écran de la structure : bouton plaque, une phrase dessous. */
function NavRow({
  icon,
  label,
  hint,
  to,
  testID,
}: {
  icon: "place" | "flag" | "chat" | "incident";
  label: string;
  hint: string;
  to: "/ma-structure" | "/bannis" | "/modeles" | "/notes";
  testID: string;
}) {
  const router = useRouter();
  return (
    <View style={styles.navRow}>
      <Button variant="plate" icon={icon} next onPress={() => router.push(to)} fullWidth testID={testID}>
        {label}
      </Button>
      <Muted variant="caption">{hint}</Muted>
    </View>
  );
}

export function StaffScreen() {
  const { t } = useTheme();
  const router = useRouter();
  const { me } = useSession();
  const { structureId, structureName } = useOrga();
  const at = useNow(60_000);
  const viewer = myRoleIn(me?.memberships, structureId);

  const structure = useApi(() => api.orgStructure(structureId), [structureId]);
  const members = useApi(() => api.structureMembers(structureId), [structureId]);
  const events = useApi(() => api.structureEvents(structureId), [structureId], {
    cacheKey: `orga-events-${structureId}`,
  });
  const choices: EventCard[] = useMemo(() => groupEvents(events.data ?? [], at).upcoming, [events.data, at]);
  const [picked, setPicked] = useState<string | null>(null);
  const current = pickCurrentEvent(events.data ?? [], at);
  const eventId = picked ?? current?.event.id ?? choices[0]?.id ?? null;
  const event = (events.data ?? []).find((e) => e.id === eventId) ?? null;

  // La réponse porte l'événement qu'elle décrit : changer d'événement n'affiche jamais la liste du précédent.
  const staff = useApi(
    async () => ({ eventId: eventId as string, members: await api.eventStaff(eventId as string) }),
    [eventId],
    { enabled: eventId !== null },
  );

  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [accepting, setAccepting] = useState<StructureMember | null>(null);
  const [declining, setDeclining] = useState<StructureMember | null>(null);
  const [managing, setManaging] = useState<StructureMember | null>(null);
  const [removing, setRemoving] = useState<StructureMember | null>(null);
  const [inviting, setInviting] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EventStaffMember | null>(null);
  const [draftRoles, setDraftRoles] = useState<StaffRole[]>([]);
  const [draftDecide, setDraftDecide] = useState(false);

  const groups = memberGroups(members.data ?? []);
  const list = eventId && staff.data?.eventId === eventId ? staff.data.members : [];
  const summary = staffSummary(list);
  const toRemind = event ? list.filter((m) => canRemind(m, event.startsAt, at)) : [];

  const reloadMembers = async () => {
    await members.reload();
    emitTeamChanged();
  };
  const done = (message: string) => {
    setAccepting(null);
    setManaging(null);
    setRemoving(null);
    setDeclining(null);
    setInviting(false);
    setSheetError(null);
    setError(null);
    setNotice(message);
    void reloadMembers();
    void staff.reload();
  };
  const bubble = (e: unknown) => {
    setAccepting(null);
    setManaging(null);
    setRemoving(null);
    setDeclining(null);
    setInviting(false);
    setError(e);
  };

  async function decline() {
    if (!declining) return;
    setBusy(declining.userId);
    setSheetError(null);
    try {
      await api.declineStaffRequest(structureId, declining.userId);
      done(L.requestDeclineDone);
    } catch (e) {
      failWith(e, setSheetError, bubble);
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!removing) return;
    setBusy(removing.userId);
    setSheetError(null);
    try {
      await api.removeMember(structureId, removing.userId);
      done(removing.status === "invited" ? L.teamInvitedRemoved : L.removeDone);
    } catch (e) {
      failWith(e, setSheetError, bubble);
    } finally {
      setBusy(null);
    }
  }

  async function remind(m: EventStaffMember) {
    if (!eventId) return;
    setBusy(m.userId);
    setError(null);
    setNotice(null);
    try {
      await api.remindStaff(eventId, m.userId);
      setNotice(orgaLabels.staffRemindDone);
      await staff.reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  async function remindAll() {
    if (!eventId) return;
    setBusy("all");
    setError(null);
    setNotice(null);
    try {
      const res = await api.remindAllStaff(eventId);
      setNotice(L.remindAllDone(res.reminded));
      await staff.reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  async function saveRoles(roles: StaffRole[] | null) {
    if (!eventId || !editing) return;
    setBusy(editing.userId);
    setSheetError(null);
    try {
      await api.updateEventStaff(eventId, editing.userId, { roles, canDecide: draftDecide });
      setEditing(null);
      setError(null);
      setNotice(L.eventRolesSaved);
      await staff.reload();
    } catch (e) {
      if (isTwoFactorError(e)) {
        setEditing(null);
        setError(e);
      } else setSheetError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const reloadAll = async () => {
    await Promise.all([structure.reload(), members.reload(), events.reload(), staff.reload()]);
    emitTeamChanged();
  };

  const failure = error ?? structure.error ?? members.error ?? events.error ?? staff.error;
  const memberCount = groups.active.length;

  return (
    <TabScreen
      title={L.teamTitle}
      facts={structureName}
      onRefresh={reloadAll}
      overlays={
        <>
          <AcceptSheet
            structureId={structureId}
            member={accepting}
            onDone={done}
            onClose={() => setAccepting(null)}
            onTwoFactor={bubble}
          />
          <MemberSheet
            structureId={structureId}
            viewer={viewer}
            member={managing}
            onDone={done}
            onClose={() => setManaging(null)}
            onTwoFactor={bubble}
            onRemove={(m) => {
              setManaging(null);
              setSheetError(null);
              setRemoving(m);
            }}
          />
          <InviteSheet
            structureId={structureId}
            viewer={viewer}
            visible={inviting}
            onDone={done}
            onClose={() => setInviting(false)}
            onTwoFactor={bubble}
          />
          <ConfirmSheet
            visible={declining !== null}
            title={L.requestDeclineTitle(declining?.pseudo ?? "")}
            body={L.requestDeclineBody}
            confirmLabel={L.requestDecline}
            confirmIcon="close"
            danger
            busy={busy === declining?.userId}
            error={sheetError}
            onConfirm={() => void decline()}
            onClose={() => {
              setDeclining(null);
              setSheetError(null);
            }}
          />
          <ConfirmSheet
            visible={removing !== null}
            title={removing?.status === "invited" ? L.teamInvitedRemove : L.removeTitle(removing?.pseudo ?? "")}
            body={removing?.status === "invited" ? L.teamInvitedRemoveBody : L.removeBody}
            confirmLabel={removing?.status === "invited" ? L.teamInvitedRemove : L.removeConfirm}
            confirmIcon="close"
            danger
            busy={busy === removing?.userId}
            error={sheetError}
            onConfirm={() => void remove()}
            onClose={() => {
              setRemoving(null);
              setSheetError(null);
            }}
          />
          <AppSheet
            visible={editing !== null}
            onClose={() => setEditing(null)}
            accessibilityLabel={orgaLabels.staffRoles}
          >
            {editing ? (
              <>
                <Text variant="title" color={t.color.ink}>
                  {editing.pseudo}
                </Text>
                <Muted variant="label">{orgaLabels.staffRoles}</Muted>
                <RolePicker
                  roles={draftRoles}
                  canDecide={draftDecide}
                  onRoles={setDraftRoles}
                  onCanDecide={setDraftDecide}
                  disabled={busy !== null}
                />
                {sheetError ? <Notice tone="error">{sheetError}</Notice> : null}
                <Button
                  variant="secondary"
                  icon="check"
                  loading={busy === editing.userId}
                  disabled={
                    (!rolesChanged(draftRoles, editing.roles) && draftDecide === editing.canDecide) || busy !== null
                  }
                  onPress={() => void saveRoles(draftRoles)}
                  fullWidth
                  testID="orga-staff-roles-save"
                >
                  {L.eventRolesSave}
                </Button>
                {editing.rolesOverride ? (
                  <Button
                    variant="plate"
                    icon="undo"
                    disabled={busy !== null}
                    onPress={() => void saveRoles(null)}
                    fullWidth
                  >
                    {L.eventRolesInherit}
                  </Button>
                ) : null}
                <Button variant="plate" icon="close" onPress={() => setEditing(null)} fullWidth>
                  Fermer
                </Button>
              </>
            ) : null}
          </AppSheet>
        </>
      }
    >
      <OrgaFailure error={failure} />
      {isSuspended(structure.data) ? <Notice tone="error">{L.structureSuspended}</Notice> : null}
      {notice ? <Notice>{notice}</Notice> : null}

      {groups.requests.length > 0 ? (
        <>
          <SectionTitle>{L.teamRequestsTitle(groups.requests.length)}</SectionTitle>
          <Muted variant="caption">{L.teamRequestsIntro}</Muted>
          {groups.requests.map((m) => (
            <Plate key={m.userId} style={styles.block} testID="team-request">
              <View style={styles.head}>
                <Text variant="bodyStrong" color={t.color.plateInk} style={styles.grow}>
                  {m.pseudo}
                </Text>
                <Chip surface="plate">{L.requestPending}</Chip>
              </View>
              <View style={styles.buttons}>
                <Button
                  variant="plate"
                  icon="check"
                  onPress={() => {
                    setNotice(null);
                    setAccepting(m);
                  }}
                  style={styles.grow}
                  testID="team-request-accept"
                >
                  {L.requestAccept}
                </Button>
                <Button
                  variant="plate"
                  tone="dashed"
                  icon="close"
                  onPress={() => {
                    setNotice(null);
                    setSheetError(null);
                    setDeclining(m);
                  }}
                  style={styles.grow}
                  testID="team-request-decline"
                >
                  {L.requestDecline}
                </Button>
              </View>
            </Plate>
          ))}
        </>
      ) : null}

      <SectionTitle>{L.teamMembersTitle(memberCount)}</SectionTitle>
      {memberCount === 0 ? (
        <Muted variant="body">{members.loading ? "Chargement…" : L.teamMembersEmpty}</Muted>
      ) : (
        groups.active.map((m) => {
          const manageable = canManageMember(viewer, m);
          return (
            <Plate key={m.userId} style={styles.block} testID="team-member">
              <View style={styles.head}>
                <Text variant="bodyStrong" color={t.color.plateInk} style={styles.grow}>
                  {m.pseudo}
                </Text>
                <Chip surface="plate">{structureRoleLabels[m.role]}</Chip>
              </View>
              {m.role === "staff" ? (
                <Text variant="caption" color={t.color.plateMuted}>
                  {m.staffRoles.map((r) => staffRoleLabels[r]).join(" · ") || L.teamRolesNone}
                  {m.canDecide ? ` · ${L.canDecideShort}` : ""}
                </Text>
              ) : null}
              {manageable ? (
                <Button
                  variant="plate"
                  icon="staff"
                  onPress={() => {
                    setNotice(null);
                    setManaging(m);
                  }}
                  fullWidth
                  testID="team-member-manage"
                >
                  {L.manage}
                </Button>
              ) : m.role !== "owner" ? (
                <Text variant="caption" color={t.color.plateMuted}>
                  {L.teamOwnerOnly}
                </Text>
              ) : null}
            </Plate>
          );
        })
      )}
      <Button
        variant="secondary"
        icon="add"
        onPress={() => {
          setNotice(null);
          setInviting(true);
        }}
        fullWidth
        testID="team-invite"
      >
        {L.invite}
      </Button>

      {groups.invited.length > 0 ? (
        <>
          <SectionTitle>{L.teamInvitedTitle(groups.invited.length)}</SectionTitle>
          {groups.invited.map((m) => (
            <Plate key={m.userId} style={styles.block} testID="team-invited">
              <Text variant="bodyStrong" color={t.color.plateInk}>
                {m.pseudo}
              </Text>
              <Text variant="caption" color={t.color.plateMuted}>
                {structureRoleLabels[m.role]}
                {m.staffRoles.length > 0 ? ` · ${m.staffRoles.map((r) => staffRoleLabels[r]).join(", ")}` : ""}
              </Text>
              {canManageMember(viewer, m) ? (
                <Button
                  variant="plate"
                  icon="close"
                  onPress={() => {
                    setNotice(null);
                    setSheetError(null);
                    setRemoving(m);
                  }}
                  fullWidth
                  testID="team-invited-remove"
                >
                  {L.teamInvitedRemove}
                </Button>
              ) : null}
            </Plate>
          ))}
        </>
      ) : null}

      <SectionTitle>{L.teamStructureSection}</SectionTitle>
      <NavRow
        icon="place"
        label={L.structureOpen}
        hint={L.structureOpenHint}
        to="/ma-structure"
        testID="team-nav-structure"
      />
      <NavRow icon="flag" label={L.bansOpen} hint={L.bansOpenHint} to="/bannis" testID="team-nav-bans" />
      <NavRow
        icon="chat"
        label={L.templatesOpen}
        hint={L.templatesOpenHint}
        to="/modeles"
        testID="team-nav-templates"
      />
      <NavRow icon="incident" label={L.notesOpen} hint={L.notesOpenHint} to="/notes" testID="team-nav-notes" />

      <SectionTitle>{L.teamEventsSection}</SectionTitle>
      {choices.length === 0 ? (
        <Muted variant="body">{events.loading ? "Chargement…" : orgaLabels.directEmpty}</Muted>
      ) : (
        <SelectField
          label={orgaLabels.staffEventPicker}
          value={eventId ?? ""}
          onValueChange={setPicked}
          options={choices.map((e) => ({ value: e.id, label: `${e.title} · ${formatDayHour(e.startsAt)}` }))}
        />
      )}

      {event ? (
        <>
          <Counters
            items={[
              { value: summary.present, label: "Présents" },
              { value: summary.absent, label: "Absents" },
              { value: summary.unknown, label: "Sans réponse" },
            ]}
            active={summary.unknown > 0 ? 2 : undefined}
          />
          {summary.neverAnswered > 0 ? (
            <Muted variant="caption">
              {orgaLabels.staffNever} : {summary.neverAnswered}
            </Muted>
          ) : null}
          {toRemind.length > 0 ? (
            <Button
              variant="plate"
              icon="bell"
              loading={busy === "all"}
              disabled={busy !== null}
              onPress={() => void remindAll()}
              fullWidth
              testID="orga-staff-remind-all"
            >
              {L.remindAll(toRemind.length)}
            </Button>
          ) : null}
          {list.length === 0 ? (
            <Muted variant="body">{staff.loading ? "Chargement…" : orgaLabels.staffEmpty}</Muted>
          ) : (
            list.map((m) => (
              <EventMemberRow
                key={m.userId}
                member={m}
                remindable={canRemind(m, event.startsAt, at)}
                busy={busy === m.userId}
                onRemind={() => void remind(m)}
                onRoles={() => {
                  setDraftRoles(m.roles);
                  setDraftDecide(m.canDecide);
                  setSheetError(null);
                  setEditing(m);
                  setError(null);
                }}
              />
            ))
          )}
          <Button
            variant="primary"
            icon="staff"
            next
            onPress={() => router.push(`/staff/${event.id}`)}
            fullWidth
            testID="orga-staff-mode"
          >
            {orgaLabels.staffModeOpen}
          </Button>
          <Muted variant="caption">{orgaLabels.staffModeHint}</Muted>
        </>
      ) : null}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
  head: { flexDirection: "row", alignItems: "center", gap: space2 },
  grow: { flex: 1 },
  buttons: { flexDirection: "row", gap: space2, marginTop: space1 },
  navRow: { gap: space1 },
});
