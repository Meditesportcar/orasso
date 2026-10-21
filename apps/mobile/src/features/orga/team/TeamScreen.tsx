// Casquette Organisateur, onglet Équipe (DA v2, lot 52, prototype `s-ostaff`) : l'équipe en bulles dont la taille suit
// le nombre d'événements tenus ; un toucher ouvre l'historique et les actions (donner un rôle pour un événement,
// message, gérer, retirer). Dessous, « Rôles pour <événement> » : quatre rôles avec les présences confirmées d'abord.
// Accepter une demande fait entrer sans rôle (lot 36) : les rôles se donnent pour un événement. Depuis le lot 48,
// seuls Accueil et scan, Contrôle et Super staff pointent les entrées : chaque rôle dit ce qu'il permet.
import { Button, Chip, Icon, Plate, SelectField, Text, tokens, useTheme } from "@orasso/design-system/native";
import {
  type EventStaffMember,
  orgaManageLabels as L,
  orgaV2Labels as L2,
  orgaLabels,
  type StaffRole,
  type StructureMember,
  staffPresenceLabels,
  staffRoleLabels,
  structureRoleLabels,
} from "@orasso/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { MessageButton } from "@/features/boite/MessageButton";
import { api } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import { canRemind, groupEvents, isTwoFactorError, pickCurrentEvent, staffSummary } from "@/lib/orga";
import { boardRoles, bubbleSize, historyOf, holdersOf, packBubbles, requestBubbleSpot, withRole } from "@/lib/orgaV2";
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
import { Bubble, RequestBubble } from "./Bubble";
import { failWith } from "./fail";
import { RolePicker } from "./RolePicker";
import { AcceptSheet, InviteSheet, MemberSheet } from "./TeamSheets";

const { space1, space2, space3 } = tokens.spacing;
/** Hauteur de la grappe (artefact `.bubbles` : 310 px). */
const CLOUD_HEIGHT = 310;

export function TeamScreen() {
  const { t } = useTheme();
  const c = t.color;
  const { me } = useSession();
  const { structureId } = useOrga();
  const at = useNow(60_000);
  const viewer = myRoleIn(me?.memberships, structureId);

  const structure = useApi(() => api.orgStructure(structureId), [structureId]);
  const members = useApi(() => api.structureMembers(structureId), [structureId]);
  const history = useApi(() => api.teamHistory(structureId), [structureId]);
  const events = useApi(() => api.structureEvents(structureId), [structureId], {
    cacheKey: `orga-events-${structureId}`,
  });
  const current = pickCurrentEvent(events.data ?? [], at);
  // Les événements à venir, plus celui du jour (même fini : son équipe reste à régler) s'il n'en fait pas partie.
  const choices = useMemo(() => {
    const upcoming = groupEvents(events.data ?? [], at).upcoming;
    const today = current?.event;
    return today && !upcoming.some((e) => e.id === today.id) ? [today, ...upcoming] : upcoming;
  }, [events.data, at, current?.event]);
  const [picked, setPicked] = useState<string | null>(null);
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
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [cloudWidth, setCloudWidth] = useState(0);
  const [giving, setGiving] = useState<StructureMember | null>(null);
  const [adding, setAdding] = useState<StaffRole | null>(null);
  // Retrait d'un rôle d'un toucher : annulable quelques secondes.
  const [undo, setUndo] = useState<{ userId: string; pseudo: string; roles: StaffRole[]; canDecide: boolean } | null>(
    null,
  );
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

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
    setRequestsOpen(false);
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
  async function setRole(userId: string, roles: StaffRole[], canDecide: boolean, message: string): Promise<boolean> {
    if (!eventId) return false;
    setBusy(userId);
    setSheetError(null);
    try {
      await api.updateEventStaff(eventId, userId, { roles, canDecide });
      setAdding(null);
      setGiving(null);
      setError(null);
      setNotice(message);
      await Promise.all([staff.reload(), history.reload()]);
      return true;
    } catch (e) {
      // Une feuille ouverte garde le message ; sinon il s'affiche à l'écran (jamais une erreur invisible).
      if (isTwoFactorError(e)) {
        closeAll();
        setError(e);
      } else if (adding !== null || giving !== null) setSheetError(errorMessage(e));
      else setError(e);
      return false;
    } finally {
      setBusy(null);
    }
  }

  /** Retire un rôle d'un toucher, puis laisse 8 s pour annuler. */
  async function removeRole(m: EventStaffMember, role: StaffRole) {
    setNotice(null);
    setUndo(null);
    const ok = await setRole(m.userId, withRole(m.roles, role, false), m.canDecide, L2.rolesRemoved);
    if (!ok) return;
    setUndo({ userId: m.userId, pseudo: m.pseudo, roles: m.roles, canDecide: m.canDecide });
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndo(null), 8_000);
  }

  async function undoRemoval() {
    if (!undo) return;
    const back = undo;
    setUndo(null);
    await setRole(back.userId, back.roles, back.canDecide, L2.rolesRestored);
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

  const failure = error ?? structure.error ?? members.error ?? history.error ?? events.error ?? staff.error;
  const openedHistory = opened ? historyOf(histories, opened.userId) : null;
  const openedStaff = opened ? list.find((m) => m.userId === opened.userId) : undefined;
  const addable = adding ? list.filter((m) => !m.roles.includes(adding)) : [];
  const summary = staffSummary(list);
  const reqSpot = requestBubbleSpot(cloudWidth, CLOUD_HEIGHT);
  const layout = useMemo(
    () => packBubbles(bubbles.map((m) => bubbleSize(historyOf(histories, m.userId).eventsHeld)), cloudWidth, CLOUD_HEIGHT, reqSpot),
    // reqSpot ne dépend que de cloudWidth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bubbles, histories, cloudWidth],
  );
  /** Pastille de rôle d'une bulle : les trois premières lettres de son premier rôle pour l'événement choisi. */
  const badgeOf = (userId: string) => {
    const role = list.find((m) => m.userId === userId)?.roles[0];
    return role ? staffRoleLabels[role].slice(0, 3) : null;
  };
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

          {/* Un toucher sur une bulle : feuille `sh-person` (rôle pour l'événement, historique, message, retirer). */}
          <AppSheet
            visible={opened !== null && giving === null && removing === null && managing === null}
            onClose={() => setOpened(null)}
            accessibilityLabel={opened?.pseudo ?? L2.historyTitle}
          >
            {opened && openedHistory ? (
              <>
                <View style={styles.sheetHead}>
                  <Bubble userId={opened.userId} pseudo={opened.pseudo} held={openedHistory.eventsHeld} size={44} />
                  <Text variant="title" color={c.ink} style={styles.grow}>
                    {opened.pseudo}
                  </Text>
                  <Button variant="close" label={L2.close} onPress={() => setOpened(null)} />
                </View>
                <View style={styles.tagRow}>
                  <View style={[styles.tag, { backgroundColor: c.ink }]}>
                    <Text variant="label" color={c.ground} style={styles.tagText}>
                      {structureRoleLabels[opened.role]}
                    </Text>
                  </View>
                  <Muted variant="caption">{L2.historyHeld(openedHistory.eventsHeld)}</Muted>
                </View>
                {event && openedStaff && opened.role === "staff" ? (
                  <>
                    <Muted variant="label">{L2.roleFor(event.title)}</Muted>
                    <View style={styles.chips}>
                      {boardRoles.map((role) => (
                        <Chip
                          key={role}
                          selected={openedStaff.roles.includes(role)}
                          accessibilityRole="toggle"
                          onPress={() =>
                            busy === null &&
                            void setRole(
                              opened.userId,
                              withRole(openedStaff.roles, role, !openedStaff.roles.includes(role)),
                              openedStaff.canDecide,
                              openedStaff.roles.includes(role) ? L2.rolesRemoved : L2.rolesGiven,
                            )
                          }
                        >
                          {staffRoleLabels[role]}
                        </Chip>
                      ))}
                      <Chip
                        selected={openedStaff.roles.length === 0}
                        onPress={() =>
                          busy === null && openedStaff.roles.length > 0
                            ? void setRole(opened.userId, [], openedStaff.canDecide, L2.rolesRemoved)
                            : undefined
                        }
                      >
                        {L2.roleNone}
                      </Chip>
                    </View>
                    {sheetError ? <Notice tone="error">{sheetError}</Notice> : null}
                  </>
                ) : null}
                <Muted variant="label">{L2.historyTitle}</Muted>
                {openedHistory.events.length === 0 ? (
                  <Muted variant="body">{L2.historyNone}</Muted>
                ) : (
                  <View style={[styles.hist, { borderColor: c.line }]}>
                    {openedHistory.events.map((h) => (
                      <View key={h.eventId} style={styles.histRow} testID="team-history-row">
                        <View style={[styles.histDot, { backgroundColor: c.accent }]} />
                        <Text variant="bodyStrong" color={c.ink}>
                          {h.title}
                        </Text>
                        <Muted variant="caption">
                          {formatDay(h.startsAt)} ·{" "}
                          {h.roles === null
                            ? L2.roleNotNoted
                            : h.roles.map((r) => staffRoleLabels[r]).join(" · ") || L.teamRolesNone}
                          {" · "}
                          {staffPresenceLabels[h.presence]}
                        </Muted>
                      </View>
                    ))}
                  </View>
                )}
                {event && openedStaff && canRemind(openedStaff, event.startsAt, at) ? (
                  <Button
                    variant="secondary"
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
                    {L2.roleMore}
                  </Button>
                ) : null}
                {canManageMember(viewer, opened) ? (
                  <View style={styles.buttons}>
                    <Button
                      variant="plate"
                      icon="list"
                      onPress={() => setManaging(opened)}
                      style={styles.grow}
                      testID="team-bubble-manage"
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
                      testID="team-bubble-remove"
                    >
                      {L2.actionRemoveShort}
                    </Button>
                  </View>
                ) : null}
              </>
            ) : null}
          </AppSheet>

          {/* La bulle « +N » : feuille `sh-req` (demandes, invitations envoyées, inviter). */}
          <AppSheet
            visible={requestsOpen && accepting === null && declining === null && removing === null && !inviting}
            onClose={() => setRequestsOpen(false)}
            accessibilityLabel={L2.requestsBubble(groups.requests.length)}
          >
            <View style={styles.sheetHead}>
              <Text variant="title" color={c.ink} style={styles.grow}>
                {groups.requests.length > 0 ? L2.requestsBubble(groups.requests.length) : L.invite}
              </Text>
              <Button variant="close" label={L2.close} onPress={() => setRequestsOpen(false)} />
            </View>
            {groups.requests.map((m) => (
              <View key={m.userId} style={[styles.oldrow, { borderColor: c.line }]} testID="team-request">
                <Text variant="bodyStrong" color={c.ink} style={styles.grow}>
                  {m.pseudo}
                </Text>
                <Button
                  variant="primary"
                  icon="check"
                  onPress={() => {
                    setNotice(null);
                    setAccepting(m);
                  }}
                  testID="team-request-accept"
                >
                  {L.requestAccept}
                </Button>
                <Button
                  variant="close"
                  label={L.requestDecline}
                  onPress={() => {
                    setNotice(null);
                    setSheetError(null);
                    setDeclining(m);
                  }}
                  testID="team-request-decline"
                />
              </View>
            ))}
            {groups.requests.length > 0 ? <Muted variant="caption">{L2.requestsSheetIntro}</Muted> : null}
            {groups.invited.length > 0 ? (
              <>
                <Muted variant="label">{L.teamInvitedTitle(groups.invited.length)}</Muted>
                {groups.invited.map((m) => (
                  <View key={m.userId} style={[styles.oldrow, { borderColor: c.line }]} testID="team-invited">
                    <View style={styles.grow}>
                      <Text variant="bodyStrong" color={c.ink}>
                        {m.pseudo}
                      </Text>
                      <Muted variant="caption">
                        {structureRoleLabels[m.role]}
                        {m.staffRoles.length > 0 ? ` · ${m.staffRoles.map((r) => staffRoleLabels[r]).join(", ")}` : ""}
                      </Muted>
                    </View>
                    {canManageMember(viewer, m) ? (
                      <Button
                        variant="close"
                        label={L.teamInvitedRemove}
                        onPress={() => {
                          setNotice(null);
                          setSheetError(null);
                          setRemoving(m);
                        }}
                        testID="team-invited-remove"
                      />
                    ) : null}
                  </View>
                ))}
              </>
            ) : null}
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
                  {L2.close}
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
      {undo ? (
        <Button variant="plate" icon="undo" onPress={() => void undoRemoval()} fullWidth testID="team-role-undo">
          {`${L2.undo} · ${undo.pseudo}`}
        </Button>
      ) : null}

      {/* La grappe `.bubbles` : carte de 310 px, bulles posées librement, « +N » en bas à droite. */}
      <View
        style={[styles.bubbles, { backgroundColor: c.surface }]}
        onLayout={(e) => setCloudWidth(Math.round(e.nativeEvent.layout.width))}
        testID="team-bubbles"
      >
        {bubbles.length === 0 ? (
          <Muted variant="body" style={styles.cloudEmpty}>
            {members.loading ? "Chargement…" : L.teamMembersEmpty}
          </Muted>
        ) : null}
        {cloudWidth > 0
          ? bubbles.map((m, i) => {
              const spot = layout[i];
              if (!spot) return null;
              return (
                <View
                  key={m.userId}
                  style={[styles.placed, { left: spot.x - spot.size / 2, top: spot.y - spot.size / 2 }]}
                >
                  <Bubble
                    userId={m.userId}
                    pseudo={m.pseudo}
                    held={historyOf(histories, m.userId).eventsHeld}
                    size={spot.size}
                    badge={badgeOf(m.userId)}
                    onPress={() => {
                      setNotice(null);
                      setOpened(m);
                    }}
                    testID="team-bubble"
                  />
                </View>
              );
            })
          : null}
        {cloudWidth > 0 ? (
          <View
            style={[
              styles.placed,
              { left: reqSpot.x - reqSpot.size / 2 - 6, top: reqSpot.y - reqSpot.size / 2 - 6 },
            ]}
          >
            <RequestBubble
              count={groups.requests.length}
              onPress={() => {
                setNotice(null);
                setRequestsOpen(true);
              }}
              label={groups.requests.length > 0 ? L2.requestsBubble(groups.requests.length) : L2.inviteBubble}
              testID="team-requests-bubble"
            />
          </View>
        ) : null}
      </View>
      <Muted variant="caption" testID="team-bubbles-hint">
        {L2.bubblesHint}
      </Muted>

      {choices.length === 0 ? (
        <Muted variant="body">{events.loading ? "Chargement…" : L2.rolesNoEvent}</Muted>
      ) : (
        <>
          <View style={styles.secH}>
            <Text variant="posterS" color={c.ink} style={styles.secTitle}>
              {event ? L2.rolesFor(event.title) : L2.rolesPresentFirst}
            </Text>
            <Muted variant="caption" style={styles.secRight}>
              {list.length > 0 ? L2.presenceConfirmed(summary.present, list.length) : L2.rolesPresentFirst}
            </Muted>
          </View>
          {choices.length > 1 ? (
            <SelectField
              label={orgaLabels.staffEventPicker}
              value={eventId ?? ""}
              onValueChange={setPicked}
              options={choices.map((e) => ({ value: e.id, label: `${e.title} · ${formatDay(e.startsAt)}` }))}
            />
          ) : null}
        </>
      )}
      {event ? (
        <>
          <View style={styles.rolesb}>
            {boardRoles.map((role) => (
              <View
                key={role}
                style={[styles.role, { backgroundColor: c.surface, borderColor: c.line }]}
                testID={`team-role-${role}`}
              >
                <View style={styles.grow}>
                  <Text variant="bodyStrong" color={c.ink}>
                    {staffRoleLabels[role]}
                  </Text>
                  <Muted variant="caption">{L2.roleHints[role]}</Muted>
                  <Muted variant="caption" style={styles.allows}>
                    {L2.roleAllows[role]}
                  </Muted>
                </View>
                <View style={styles.avs}>
                  {holdersOf(list, role).map((m) => (
                    <View key={m.userId} style={[styles.av, { borderColor: c.surface }]} testID="team-role-holder">
                      <Bubble
                        userId={m.userId}
                        pseudo={m.pseudo}
                        held={historyOf(histories, m.userId).eventsHeld}
                        size={32}
                        dim={m.presence !== "present"}
                        label={L2.removeRoleLabel(staffRoleLabels[role], m.pseudo)}
                        disabled={busy !== null}
                        onPress={() => void removeRole(m, role)}
                      />
                    </View>
                  ))}
                  <Pressable
                    onPress={() => {
                      setSheetError(null);
                      setAdding(role);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${L2.rolesAddMember} : ${staffRoleLabels[role]}`}
                    testID={`team-role-add-${role}`}
                    style={[styles.avAdd, { backgroundColor: c.surface, borderColor: c.line }]}
                  >
                    <Icon name="add" size={16} color={c.ink} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
          {toRemind.length > 0 ? (
            <Button
              variant="secondary"
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
        </>
      ) : null}
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
        {L2.close}
      </Button>
    </>
  );
}

const styles = StyleSheet.create({
  row: { gap: space2, padding: space3 },
  line: { flexDirection: "row", alignItems: "center", gap: space2 },
  grow: { flex: 1, gap: space1 },
  buttons: { flexDirection: "row", gap: space2, marginTop: space1 },
  bubbles: { height: CLOUD_HEIGHT, borderRadius: 24, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.40)" },
  cloudEmpty: { padding: space3 },
  placed: { position: "absolute" },
  secH: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginTop: space2 },
  secTitle: { flex: 1, fontSize: 16, fontStyle: "italic", textTransform: "uppercase" },
  secRight: { flexShrink: 1, textAlign: "right" },
  rolesb: { gap: 8 },
  role: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 16, borderWidth: 1 },
  allows: { fontSize: 12 },
  avs: { flexDirection: "row", alignItems: "center", paddingLeft: 8 },
  av: { marginLeft: -8, borderRadius: 18, borderWidth: 2 },
  avAdd: { marginLeft: -8, width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  tagRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space2 },
  tag: { height: 22, justifyContent: "center", paddingHorizontal: 9, borderRadius: 4, transform: [{ skewX: "-8deg" }] },
  tagText: { transform: [{ skewX: "8deg" }] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space2 },
  hist: { marginLeft: 8, paddingLeft: 14, borderLeftWidth: 2, gap: space3 },
  histRow: { gap: 2 },
  histDot: { position: "absolute", left: -20, top: 5, width: 10, height: 10, borderRadius: 5 },
  oldrow: { flexDirection: "row", alignItems: "center", gap: space2, paddingVertical: space2, borderBottomWidth: 1 },
  sheetHead: { flexDirection: "row", alignItems: "center", gap: space3 },
  holders: { flexDirection: "row", flexWrap: "wrap", gap: space3 },
  holder: { alignItems: "center", gap: space1 },
});
