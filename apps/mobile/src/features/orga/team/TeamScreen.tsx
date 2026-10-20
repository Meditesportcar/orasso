// Casquette Organisateur, onglet Équipe (DA v2, lot 52, prototype `s-ostaff`) : l'équipe en bulles dont la taille suit
// le nombre d'événements tenus ; un toucher ouvre l'historique et les actions (donner un rôle pour un événement,
// message, gérer, retirer). Dessous, « Rôles pour <événement> » : quatre rôles avec les présences confirmées d'abord.
// Accepter une demande fait entrer sans rôle (lot 36) : les rôles se donnent pour un événement. Depuis le lot 48,
// seuls Accueil et scan, Contrôle et Super staff pointent les entrées : chaque rôle dit ce qu'il permet.
import { Button, Chip, Counters, Plate, SelectField, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  orgaManageLabels as L,
  orgaV2Labels as L2,
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

import { MessageButton } from "@/features/boite/MessageButton";
import { api } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { canRemind, groupEvents, isTwoFactorError, pickCurrentEvent, staffSummary } from "@/lib/orga";
import { boardRoles, historyOf, holdersOf, withRole } from "@/lib/orgaV2";
import { useSession } from "@/lib/session";
import { emitTeamChanged } from "@/lib/teamBadge";
import { canManageMember, isSuspended, memberGroups, myRoleIn } from "@/lib/teamModel";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { AppSheet } from "@/ui/AppSheet";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { SectionTitle, TabScreen } from "@/ui/Screens";
import { ConfirmSheet } from "../ConfirmSheet";
import { OrgaFailure, useOrga } from "../OrgaGate";
import { Bubble } from "./Bubble";
import { failWith } from "./fail";
import { RolePicker } from "./RolePicker";
import { AcceptSheet, InviteSheet, MemberSheet } from "./TeamSheets";

const { space1, space2, space3 } = tokens.spacing;

export function TeamScreen() {
  const { t } = useTheme();
  const c = t.color;
  const router = useRouter();
  const { me } = useSession();
  const { structureId, structureName } = useOrga();
  const at = useNow(60_000);
  const viewer = myRoleIn(me?.memberships, structureId);

  const structure = useApi(() => api.orgStructure(structureId), [structureId]);
  const members = useApi(() => api.structureMembers(structureId), [structureId]);
  const history = useApi(() => api.teamHistory(structureId), [structureId]);
  const events = useApi(() => api.structureEvents(structureId), [structureId], {
    cacheKey: `orga-events-${structureId}`,
  });
  const choices = useMemo(() => groupEvents(events.data ?? [], at).upcoming, [events.data, at]);
  const [picked, setPicked] = useState<string | null>(null);
  const current = pickCurrentEvent(events.data ?? [], at);
  const eventId = picked ?? current?.event.id ?? choices[0]?.id ?? null;
  const event = (events.data ?? []).find((e) => e.id === eventId) ?? null;
  const staff = useApi(
    async () => ({ eventId: eventId as string, members: await api.eventStaff(eventId as string) }),
    [eventId],
    { enabled: eventId !== null },
  );
  const list = eventId && staff.data?.eventId === eventId ? staff.data.members : [];

  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [opened, setOpened] = useState<StructureMember | null>(null);
  const [accepting, setAccepting] = useState<StructureMember | null>(null);
  const [declining, setDeclining] = useState<StructureMember | null>(null);
  const [managing, setManaging] = useState<StructureMember | null>(null);
  const [removing, setRemoving] = useState<StructureMember | null>(null);
  const [inviting, setInviting] = useState(false);
  const [giving, setGiving] = useState<StructureMember | null>(null);
  const [adding, setAdding] = useState<StaffRole | null>(null);

  const groups = memberGroups(members.data ?? []);
  const histories = history.data ?? [];
  // Les plus engagés d'abord : les grandes bulles en tête.
  const bubbles = useMemo(
    () =>
      [...groups.active].sort(
        (a, b) =>
          historyOf(histories, b.userId).eventsHeld - historyOf(histories, a.userId).eventsHeld ||
          a.pseudo.localeCompare(b.pseudo, "fr"),
      ),
    [groups.active, histories],
  );

  const reloadMembers = async () => {
    await Promise.all([members.reload(), history.reload()]);
    emitTeamChanged();
  };
  const closeAll = () => {
    setOpened(null);
    setAccepting(null);
    setManaging(null);
    setRemoving(null);
    setDeclining(null);
    setInviting(false);
    setGiving(null);
    setAdding(null);
    setSheetError(null);
  };
  const done = (message: string) => {
    closeAll();
    setError(null);
    setNotice(message);
    void reloadMembers();
    void staff.reload();
  };
  const bubble = (e: unknown) => {
    closeAll();
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

  /** Donne ou retire un rôle à un membre pour l'événement choisi (l'API garde les droits et la double authentification). */
  async function setRole(userId: string, roles: StaffRole[], canDecide: boolean, message: string) {
    if (!eventId) return;
    setBusy(userId);
    setSheetError(null);
    try {
      await api.updateEventStaff(eventId, userId, { roles, canDecide });
      setAdding(null);
      setGiving(null);
      setError(null);
      setNotice(message);
      await Promise.all([staff.reload(), history.reload()]);
    } catch (e) {
      if (isTwoFactorError(e)) {
        closeAll();
        setError(e);
      } else setSheetError(errorMessage(e));
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

  async function remind(userId: string) {
    if (!eventId) return;
    setBusy(userId);
    setError(null);
    setNotice(null);
    try {
      await api.remindStaff(eventId, userId);
      closeAll();
      setNotice(orgaLabels.staffRemindDone);
      await staff.reload();
    } catch (e) {
      closeAll();
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  const reloadAll = async () => {
    await Promise.all([structure.reload(), members.reload(), history.reload(), events.reload(), staff.reload()]);
    emitTeamChanged();
  };

  const failure = error ?? structure.error ?? members.error ?? events.error ?? staff.error;
  const openedHistory = opened ? historyOf(histories, opened.userId) : null;
  const openedStaff = opened ? list.find((m) => m.userId === opened.userId) : undefined;
  const addable = adding ? list.filter((m) => !m.roles.includes(adding)) : [];
  const summary = staffSummary(list);
  const toRemind = event ? list.filter((m) => canRemind(m, event.startsAt, at)) : [];

  return (
    <TabScreen
      title={L2.teamTitle}
      facts={L2.teamCount(groups.active.length, groups.requests.length)}
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

          {/* Un toucher sur une bulle : historique et actions. */}
          <AppSheet
            visible={opened !== null && giving === null && removing === null && managing === null}
            onClose={() => setOpened(null)}
            accessibilityLabel={opened?.pseudo ?? L2.historyTitle}
          >
            {opened && openedHistory ? (
              <>
                <View style={styles.sheetHead}>
                  <Bubble pseudo={opened.pseudo} kind={opened.role} held={openedHistory.eventsHeld} />
                  <View style={styles.grow}>
                    <Text variant="title" color={c.ink}>
                      {opened.pseudo}
                    </Text>
                    <Muted variant="caption">
                      {structureRoleLabels[opened.role]} · {L2.historyHeld(openedHistory.eventsHeld)}
                    </Muted>
                  </View>
                </View>
                <SectionTitle>{L2.historyTitle}</SectionTitle>
                {openedHistory.events.length === 0 ? (
                  <Muted variant="body">{L2.historyNone}</Muted>
                ) : (
                  openedHistory.events.map((h) => (
                    <Plate key={h.eventId} style={styles.row} testID="team-history-row">
                      <Text variant="bodyStrong" color={c.plateInk}>
                        {h.title}
                      </Text>
                      <Text variant="caption" color={c.plateMuted}>
                        {formatDay(h.startsAt)} ·{" "}
                        {h.roles.map((r) => staffRoleLabels[r]).join(" · ") || L.teamRolesNone}
                        {" · "}
                        {staffPresenceLabels[h.presence]}
                      </Text>
                    </Plate>
                  ))
                )}
                <SectionTitle>{L2.actionsTitle}</SectionTitle>
                {opened.role === "staff" ? (
                  <Button
                    variant="plate"
                    icon="staff"
                    onPress={() => {
                      setSheetError(null);
                      setGiving(opened);
                    }}
                    fullWidth
                    testID="team-give-role"
                  >
                    {L2.actionGiveRole}
                  </Button>
                ) : null}
                {event && openedStaff && canRemind(openedStaff, event.startsAt, at) ? (
                  <Button
                    variant="plate"
                    icon="bell"
                    loading={busy === opened.userId}
                    disabled={busy !== null}
                    onPress={() => void remind(opened.userId)}
                    fullWidth
                    testID="orga-staff-remind"
                  >
                    {orgaLabels.staffRemind}
                  </Button>
                ) : null}
                <MessageButton userId={opened.userId} pseudo={opened.pseudo} />
                {canManageMember(viewer, opened) ? (
                  <>
                    <Button
                      variant="plate"
                      icon="list"
                      onPress={() => {
                        setManaging(opened);
                      }}
                      fullWidth
                      testID="team-member-manage"
                    >
                      {L2.actionManage}
                    </Button>
                    <Button
                      variant="plate"
                      tone="dashed"
                      icon="close"
                      onPress={() => {
                        setSheetError(null);
                        setRemoving(opened);
                      }}
                      fullWidth
                      testID="team-member-remove"
                    >
                      {L2.actionRemove}
                    </Button>
                  </>
                ) : null}
                <Button variant="plate" icon="close" onPress={() => setOpened(null)} fullWidth>
                  Fermer
                </Button>
              </>
            ) : null}
          </AppSheet>

          {/* « Donner un rôle pour un événement » depuis la feuille d'une bulle. */}
          <AppSheet visible={giving !== null} onClose={() => setGiving(null)} accessibilityLabel={L2.actionGiveRole}>
            {giving ? (
              <GiveRole
                member={giving}
                events={choices.map((e) => ({ value: e.id, label: `${e.title} · ${formatDay(e.startsAt)}` }))}
                eventId={eventId}
                onPick={setPicked}
                staff={list}
                error={sheetError}
                busy={busy === giving.userId}
                onSave={(roles, canDecide) => void setRole(giving.userId, roles, canDecide, L2.rolesGiven)}
                onClose={() => setGiving(null)}
              />
            ) : null}
          </AppSheet>

          {/* Ajouter quelqu'un à un rôle de l'événement. */}
          <AppSheet
            visible={adding !== null}
            onClose={() => setAdding(null)}
            accessibilityLabel={adding ? staffRoleLabels[adding] : ""}
          >
            {adding ? (
              <>
                <Text variant="title" color={c.ink}>
                  {staffRoleLabels[adding]}
                </Text>
                <Muted variant="caption">{L2.rolesTapHint}</Muted>
                {sheetError ? <Notice tone="error">{sheetError}</Notice> : null}
                {addable.length === 0 ? <Muted variant="body">{L2.rolesNobody}</Muted> : null}
                {addable.map((m) => (
                  <Plate key={m.userId} style={styles.line} testID="team-role-candidate">
                    <View style={styles.grow}>
                      <Text variant="bodyStrong" color={c.plateInk}>
                        {m.pseudo}
                      </Text>
                      <Text variant="caption" color={c.plateMuted}>
                        {staffPresenceLabels[m.presence]}
                      </Text>
                    </View>
                    <Button
                      variant="plate"
                      icon="add"
                      loading={busy === m.userId}
                      disabled={busy !== null}
                      onPress={() =>
                        void setRole(m.userId, withRole(m.roles, adding, true), m.canDecide, L2.rolesGiven)
                      }
                      testID="team-role-give"
                    >
                      {staffRoleLabels[adding]}
                    </Button>
                  </Plate>
                ))}
                <Button variant="plate" icon="close" onPress={() => setAdding(null)} fullWidth>
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
            <Plate key={m.userId} style={styles.row} testID="team-request">
              <View style={styles.line}>
                <Text variant="bodyStrong" color={c.plateInk} style={styles.grow}>
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

      <Muted variant="caption" testID="team-bubbles-hint">
        {L2.bubblesHint}
      </Muted>
      {bubbles.length === 0 ? (
        <Muted variant="body">{members.loading ? "Chargement…" : L.teamMembersEmpty}</Muted>
      ) : (
        <View style={styles.cloud} testID="team-bubbles">
          {bubbles.map((m) => (
            <Bubble
              key={m.userId}
              pseudo={m.pseudo}
              kind={m.role}
              held={historyOf(histories, m.userId).eventsHeld}
              onPress={() => {
                setNotice(null);
                setOpened(m);
              }}
              testID="team-bubble"
            />
          ))}
        </View>
      )}
      <Button
        variant="primary"
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
            <Plate key={m.userId} style={styles.row} testID="team-invited">
              <Text variant="bodyStrong" color={c.plateInk}>
                {m.pseudo}
              </Text>
              <Text variant="caption" color={c.plateMuted}>
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

      <SectionTitle>{L2.rolesFor(event?.title ?? "")}</SectionTitle>
      {choices.length === 0 ? (
        <Muted variant="body">{events.loading ? "Chargement…" : L2.rolesNoEvent}</Muted>
      ) : (
        <SelectField
          label={orgaLabels.staffEventPicker}
          value={eventId ?? ""}
          onValueChange={setPicked}
          options={choices.map((e) => ({ value: e.id, label: `${e.title} · ${formatDay(e.startsAt)}` }))}
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
          <Muted variant="caption">{L2.rolesCheckinIntro}</Muted>
          {boardRoles.map((role) => (
            <Plate key={role} style={styles.row} testID={`team-role-${role}`}>
              <View style={styles.line}>
                <View style={styles.grow}>
                  <Text variant="bodyStrong" color={c.plateInk}>
                    {staffRoleLabels[role]}
                  </Text>
                  <Text variant="caption" color={c.plateMuted}>
                    {L2.roleHints[role]}
                  </Text>
                </View>
                <Button
                  variant="plate"
                  icon="add"
                  onPress={() => {
                    setSheetError(null);
                    setAdding(role);
                  }}
                  accessibilityLabel={`${L2.rolesAddMember} : ${staffRoleLabels[role]}`}
                  testID={`team-role-add-${role}`}
                >
                  Ajouter
                </Button>
              </View>
              <Text variant="caption" color={c.plateMuted}>
                {L2.roleAllows[role]}
              </Text>
              <View style={styles.holders}>
                {holdersOf(list, role).length === 0 ? (
                  <Text variant="caption" color={c.plateMuted}>
                    {L2.rolesNobody}
                  </Text>
                ) : null}
                {holdersOf(list, role).map((m) => (
                  <View key={m.userId} style={styles.holder} testID="team-role-holder">
                    <Bubble
                      pseudo={m.pseudo}
                      kind="staff"
                      held={historyOf(histories, m.userId).eventsHeld}
                      size={44}
                      mark={m.presence === "present"}
                      onPress={() =>
                        void setRole(m.userId, withRole(m.roles, role, false), m.canDecide, L2.rolesRemoved)
                      }
                    />
                    <Text variant="meta" color={c.plateMuted}>
                      {m.presence === "present"
                        ? L2.rolesPresent
                        : m.presence === "absent"
                          ? L2.rolesAbsent
                          : L2.rolesPending}
                    </Text>
                  </View>
                ))}
              </View>
            </Plate>
          ))}
          <Button
            variant="plate"
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

      <SectionTitle>{L.teamStructureSection}</SectionTitle>
      <Button variant="plate" icon="flag" next onPress={() => router.push("/bannis")} fullWidth testID="team-nav-bans">
        {L.bansOpen}
      </Button>
      <Button
        variant="plate"
        icon="chat"
        next
        onPress={() => router.push("/modeles")}
        fullWidth
        testID="team-nav-templates"
      >
        {L.templatesOpen}
      </Button>
      <Button
        variant="plate"
        icon="incident"
        next
        onPress={() => router.push("/notes")}
        fullWidth
        testID="team-nav-notes"
      >
        {L.notesOpen}
      </Button>
    </TabScreen>
  );
}

/** Les rôles d'un membre pour un événement, avec ce que chacun permet. */
function GiveRole({
  member,
  events,
  eventId,
  onPick,
  staff,
  error,
  busy,
  onSave,
  onClose,
}: {
  member: StructureMember;
  events: { value: string; label: string }[];
  eventId: string | null;
  onPick: (id: string) => void;
  staff: readonly { userId: string; roles: StaffRole[]; canDecide: boolean }[];
  error: string | null;
  busy: boolean;
  onSave: (roles: StaffRole[], canDecide: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useTheme();
  const entry = staff.find((m) => m.userId === member.userId);
  const [roles, setRoles] = useState<StaffRole[] | null>(null);
  const [canDecide, setCanDecide] = useState<boolean | null>(null);
  const shown = roles ?? entry?.roles ?? [];
  return (
    <>
      <Text variant="title" color={t.color.ink}>
        {member.pseudo}
      </Text>
      {events.length === 0 ? (
        <Muted variant="body">{L2.rolesNoEvent}</Muted>
      ) : (
        <SelectField
          label={orgaLabels.staffEventPicker}
          value={eventId ?? ""}
          onValueChange={(id) => {
            setRoles(null);
            setCanDecide(null);
            onPick(id);
          }}
          options={events}
        />
      )}
      <Muted variant="caption">{L2.rolesCheckinIntro}</Muted>
      <RolePicker
        roles={shown}
        canDecide={canDecide ?? entry?.canDecide ?? false}
        onRoles={setRoles}
        onCanDecide={setCanDecide}
        disabled={busy}
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button
        variant="secondary"
        icon="check"
        loading={busy}
        disabled={busy || !eventId || !entry}
        onPress={() => onSave(shown, canDecide ?? entry?.canDecide ?? false)}
        fullWidth
        testID="team-give-role-save"
      >
        {L.eventRolesSave}
      </Button>
      <Button variant="plate" icon="close" onPress={onClose} fullWidth>
        Fermer
      </Button>
    </>
  );
}

const styles = StyleSheet.create({
  row: { gap: space2, padding: space3 },
  line: { flexDirection: "row", alignItems: "center", gap: space2 },
  grow: { flex: 1, gap: space1 },
  buttons: { flexDirection: "row", gap: space2, marginTop: space1 },
  cloud: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space3,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: space3,
  },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: space3 },
  holders: { flexDirection: "row", flexWrap: "wrap", gap: space3 },
  holder: { alignItems: "center", gap: space1 },
});
