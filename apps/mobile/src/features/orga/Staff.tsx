// Casquette Organisateur, Staff (lot 22, ARCHITECTURE-SUITE § 7.2) : pour un événement, qui sera là (présences),
// « Relancer » ceux qui n'ont pas répondu, « Jamais répondu » (relancés sans effet), les rôles de l'événement ; puis
// les membres de la structure et « Passer en mode staff ». La gestion fine (invitations, rôles de la structure,
// demandes) est celle du site (lot 24) : ce fichier lit l'API existante et renvoie vers le site pour le reste.
import {
  Button,
  CheckboxField,
  Chip,
  Counters,
  Plate,
  SelectField,
  Text,
  tokens,
  useTheme,
} from "@orasso/design-system/native";
import {
  type EventCard,
  type EventStaffMember,
  orgaLabels,
  type StaffRole,
  staffPresenceLabels,
  staffRoleLabels,
  staffRoles,
  structureRoleLabels,
} from "@orasso/shared";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { siteUrl } from "@/api";
import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";
import { errorMessage } from "@/lib/http";
import {
  canRemind,
  groupEvents,
  orgaSitePath,
  pickCurrentEvent,
  rolesChanged,
  staffSummary,
  structureSlugOf,
  toggleRole,
} from "@/lib/orga";
import { useSession } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { useNow } from "@/lib/useNow";
import { AppSheet } from "@/ui/AppSheet";
import { Muted } from "@/ui/Muted";
import { Notice } from "@/ui/Notice";
import { SectionTitle, TabScreen } from "@/ui/Screens";
import { OrgaFailure, useOrga } from "./OrgaGate";

const { space1, space2, space3 } = tokens.spacing;

function MemberRow({
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
        {member.roles.map((r) => staffRoleLabels[r]).join(" · ") || "Aucun rôle"}
        {member.rolesOverride ? " (ajustés pour l'événement)" : ""}
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
          {orgaLabels.staffRoles}
        </Button>
      </View>
    </Plate>
  );
}

export function StaffScreen() {
  const { t } = useTheme();
  const router = useRouter();
  const { me } = useSession();
  const { structureId, structureName } = useOrga();
  const at = useNow(60_000);
  const events = useApi(() => api.structureEvents(structureId), [structureId], {
    cacheKey: `orga-events-${structureId}`,
  });
  const choices: EventCard[] = useMemo(() => groupEvents(events.data ?? [], at).upcoming, [events.data, at]);
  const [picked, setPicked] = useState<string | null>(null);
  const current = pickCurrentEvent(events.data ?? [], at);
  const eventId = picked ?? current?.event.id ?? choices[0]?.id ?? null;
  const event = (events.data ?? []).find((e) => e.id === eventId) ?? null;

  const staff = useApi(() => api.eventStaff(eventId as string), [eventId], { enabled: eventId !== null });
  const members = useApi(() => api.structureMembers(structureId), [structureId]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EventStaffMember | null>(null);
  const [draftRoles, setDraftRoles] = useState<StaffRole[]>([]);
  const slug = structureSlugOf(me?.memberships, structureId);

  const list = eventId ? (staff.data ?? []) : [];
  const summary = staffSummary(list);

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
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function saveRoles(roles: StaffRole[] | null) {
    if (!eventId || !editing) return;
    setBusy(editing.userId);
    setError(null);
    try {
      await api.updateEventStaff(eventId, editing.userId, { roles });
      setEditing(null);
      setNotice(orgaLabels.staffRolesSaved);
      await staff.reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const reloadAll = async () => {
    await Promise.all([events.reload(), staff.reload(), members.reload()]);
  };

  return (
    <TabScreen
      title={orgaLabels.staffTitle}
      facts={structureName}
      onRefresh={reloadAll}
      overlays={
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
              {staffRoles.map((role) => (
                <CheckboxField
                  key={role}
                  label={staffRoleLabels[role]}
                  checked={draftRoles.includes(role)}
                  onChange={() => setDraftRoles((cur) => toggleRole(cur, role, staffRoles))}
                />
              ))}
              <Button
                variant="secondary"
                icon="check"
                loading={busy === editing.userId}
                disabled={!rolesChanged(draftRoles, editing.roles) || busy !== null}
                onPress={() => void saveRoles(draftRoles)}
                fullWidth
              >
                {orgaLabels.staffRolesSave}
              </Button>
              {editing.rolesOverride ? (
                <Button
                  variant="plate"
                  icon="undo"
                  disabled={busy !== null}
                  onPress={() => void saveRoles(null)}
                  fullWidth
                >
                  {orgaLabels.staffRolesStructure}
                </Button>
              ) : null}
              <Button variant="plate" icon="close" onPress={() => setEditing(null)} fullWidth>
                Fermer
              </Button>
            </>
          ) : null}
        </AppSheet>
      }
    >
      <OrgaFailure error={events.error ?? staff.error ?? members.error} />
      {error ? <Notice tone="error">{error}</Notice> : null}
      {notice ? <Notice>{notice}</Notice> : null}

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
          {list.length === 0 ? (
            <Muted variant="body">{staff.loading ? "Chargement…" : orgaLabels.staffEmpty}</Muted>
          ) : (
            list.map((m) => (
              <MemberRow
                key={m.userId}
                member={m}
                remindable={canRemind(m, event.startsAt, at)}
                busy={busy === m.userId}
                onRemind={() => void remind(m)}
                onRoles={() => {
                  setDraftRoles(m.roles);
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

      <SectionTitle>{orgaLabels.staffMembers}</SectionTitle>
      {(members.data ?? []).filter((m) => m.status === "active").length === 0 ? (
        <Muted variant="body">{members.loading ? "Chargement…" : orgaLabels.staffMembersEmpty}</Muted>
      ) : (
        <Plate style={styles.block} testID="orga-members">
          {(members.data ?? [])
            .filter((m) => m.status === "active")
            .map((m) => (
              <View key={m.userId} style={styles.head}>
                <Text variant="bodyStrong" color={t.color.plateInk} style={styles.grow}>
                  {m.pseudo}
                </Text>
                <Text variant="caption" color={t.color.plateMuted}>
                  {structureRoleLabels[m.role]}
                </Text>
              </View>
            ))}
        </Plate>
      )}
      <Button
        variant="plate"
        icon="export"
        disabled={!slug}
        onPress={() => slug && void Linking.openURL(siteUrl(orgaSitePath(slug, "/structure")))}
        fullWidth
      >
        {orgaLabels.staffManageOnSite}
      </Button>
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  block: { gap: space2, padding: space3 },
  head: { flexDirection: "row", alignItems: "center", gap: space2 },
  grow: { flex: 1 },
  buttons: { flexDirection: "row", gap: space2, marginTop: space1 },
});
