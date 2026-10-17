// Feuilles de l'écran Équipe (lot 35a, décision D20) : accepter une demande de staff (rôles d'emblée), modifier un membre
// (rôles, droit de trancher, rôle dans la structure pour le propriétaire), inviter. Mêmes règles et mêmes mots que la
// page Staff du site ; les droits sont ceux de l'API, qui répond par un message quand elle refuse.
import { Button, SelectField, Text, TextField, useTheme } from "@orasso/design-system/native";
import {
  orgaManageLabels as L,
  type StaffRole,
  type StructureMember,
  type StructureRole,
  structureRoleLabels,
} from "@orasso/shared";
import { useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";
import { rolesChanged } from "@/lib/orga";
import { canManageMember, inviteBody } from "@/lib/teamModel";
import { AppSheet } from "@/ui/AppSheet";
import { Notice } from "@/ui/Notice";
import { failWith } from "./fail";
import { RolePicker } from "./RolePicker";

type Common = {
  structureId: string;
  /** L'écriture a réussi : message à afficher, l'écran recharge. */
  onDone: (message: string) => void;
  onClose: () => void;
  /** Refus pour double authentification : l'écran ouvre l'étape de second facteur. */
  onTwoFactor: (error: unknown) => void;
};

/** Accepter une demande pour devenir staff : on choisit les rôles tout de suite (modifiables ensuite). */
export function AcceptSheet({
  structureId,
  member,
  onDone,
  onClose,
  onTwoFactor,
}: Common & { member: StructureMember | null }) {
  const { t } = useTheme();
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [canDecide, setCanDecide] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Remis à zéro à chaque demande ouverte (l'identifiant), pas à chaque rechargement de la liste.
  const id = member?.userId ?? null;
  useEffect(() => {
    if (id === null) return;
    setRoles([]);
    setCanDecide(false);
    setError(null);
  }, [id]);

  async function accept() {
    if (!member) return;
    setBusy(true);
    setError(null);
    try {
      await api.acceptStaffRequest(structureId, member.userId, { staffRoles: roles, canDecide });
      onDone(L.requestAcceptDone);
    } catch (e) {
      failWith(e, setError, onTwoFactor);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppSheet
      visible={member !== null}
      onClose={onClose}
      accessibilityLabel={L.requestAcceptTitle(member?.pseudo ?? "")}
    >
      {member ? (
        <>
          <Text variant="title" color={t.color.ink}>
            {L.requestAcceptTitle(member.pseudo)}
          </Text>
          <RolePicker
            roles={roles}
            canDecide={canDecide}
            onRoles={setRoles}
            onCanDecide={setCanDecide}
            disabled={busy}
          />
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button
            variant="secondary"
            icon="check"
            loading={busy}
            disabled={busy}
            onPress={() => void accept()}
            fullWidth
            testID="team-accept-confirm"
          >
            {L.requestAccept}
          </Button>
          <Button variant="plate" icon="close" onPress={onClose} disabled={busy} fullWidth>
            Annuler
          </Button>
        </>
      ) : null}
    </AppSheet>
  );
}

/** Gérer un membre : rôles du staff, droit de trancher, rôle dans la structure (propriétaire), retrait. */
export function MemberSheet({
  structureId,
  viewer,
  member,
  onDone,
  onClose,
  onTwoFactor,
  onRemove,
}: Common & {
  viewer: StructureRole | null;
  member: StructureMember | null;
  onRemove: (member: StructureMember) => void;
}) {
  const { t } = useTheme();
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [canDecide, setCanDecide] = useState(false);
  const [role, setRole] = useState<"co_organizer" | "staff">("staff");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Rempli à l'ouverture sur un membre (l'identifiant), pas à chaque rechargement de la liste : la saisie en cours reste.
  const latest = useRef(member);
  latest.current = member;
  const id = member?.userId ?? null;
  useEffect(() => {
    const m = id === null ? null : latest.current;
    if (!m) return;
    setRoles(m.staffRoles);
    setCanDecide(m.canDecide);
    setRole(m.role === "co_organizer" ? "co_organizer" : "staff");
    setError(null);
  }, [id]);

  const editable = member ? canManageMember(viewer, member) : false;
  const roleChanged = member ? role !== (member.role === "co_organizer" ? "co_organizer" : "staff") : false;
  const changed = member
    ? rolesChanged(roles, member.staffRoles) || canDecide !== member.canDecide || roleChanged
    : false;

  async function save() {
    if (!member) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateMember(structureId, member.userId, {
        staffRoles: roles,
        canDecide,
        ...(viewer === "owner" && roleChanged ? { role } : {}),
      });
      onDone(L.rolesSaved);
    } catch (e) {
      failWith(e, setError, onTwoFactor);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppSheet visible={member !== null} onClose={onClose} accessibilityLabel={L.manageTitle(member?.pseudo ?? "")}>
      {member ? (
        <>
          <Text variant="title" color={t.color.ink}>
            {L.manageTitle(member.pseudo)}
          </Text>
          {viewer === "owner" && editable ? (
            <SelectField
              label={L.structureRole}
              value={role}
              onValueChange={(v) => setRole(v === "co_organizer" ? "co_organizer" : "staff")}
              options={[
                { value: "staff", label: structureRoleLabels.staff },
                { value: "co_organizer", label: structureRoleLabels.co_organizer },
              ]}
            />
          ) : null}
          {role === "staff" ? (
            <RolePicker
              roles={roles}
              canDecide={canDecide}
              onRoles={setRoles}
              onCanDecide={setCanDecide}
              disabled={busy || !editable}
            />
          ) : null}
          {error ? <Notice tone="error">{error}</Notice> : null}
          <Button
            variant="secondary"
            icon="check"
            loading={busy}
            disabled={busy || !changed || !editable}
            onPress={() => void save()}
            fullWidth
            testID="team-member-save"
          >
            {L.rolesSave}
          </Button>
          {editable ? (
            <Button
              variant="plate"
              icon="close"
              disabled={busy}
              onPress={() => onRemove(member)}
              fullWidth
              testID="team-member-remove"
            >
              {L.removeMember}
            </Button>
          ) : null}
          <Button variant="plate" icon="back" onPress={onClose} disabled={busy} fullWidth>
            Fermer
          </Button>
        </>
      ) : null}
    </AppSheet>
  );
}

/** Inviter par pseudo ou e-mail ; le propriétaire peut nommer un co-organisateur. */
export function InviteSheet({
  structureId,
  viewer,
  visible,
  onDone,
  onClose,
  onTwoFactor,
}: Common & { viewer: StructureRole | null; visible: boolean }) {
  const { t } = useTheme();
  const [who, setWho] = useState("");
  const [role, setRole] = useState<"co_organizer" | "staff">("staff");
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [canDecide, setCanDecide] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (visible) {
      setWho("");
      setRole("staff");
      setRoles([]);
      setCanDecide(false);
      setError(null);
    }
  }, [visible]);

  async function send() {
    const body = inviteBody({ who, role, staffRoles: roles, canDecide }, viewer);
    if ("error" in body) {
      setError(body.error);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.inviteMember(structureId, body);
      onDone(L.inviteDone);
    } catch (e) {
      failWith(e, setError, onTwoFactor);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppSheet visible={visible} onClose={onClose} accessibilityLabel={L.inviteTitle}>
      <Text variant="title" color={t.color.ink}>
        {L.inviteTitle}
      </Text>
      <TextField
        label={L.inviteWho}
        value={who}
        onChangeText={setWho}
        autoCapitalize="none"
        autoCorrect={false}
        testID="team-invite-who"
      />
      {viewer === "owner" ? (
        <SelectField
          label={L.structureRole}
          value={role}
          onValueChange={(v) => setRole(v === "co_organizer" ? "co_organizer" : "staff")}
          options={[
            { value: "staff", label: structureRoleLabels.staff },
            { value: "co_organizer", label: structureRoleLabels.co_organizer },
          ]}
        />
      ) : null}
      <RolePicker roles={roles} canDecide={canDecide} onRoles={setRoles} onCanDecide={setCanDecide} disabled={busy} />
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button
        variant="secondary"
        icon="add"
        loading={busy}
        disabled={busy || who.trim() === ""}
        onPress={() => void send()}
        fullWidth
        testID="team-invite-send"
      >
        {L.inviteSend}
      </Button>
      <Button variant="plate" icon="close" onPress={onClose} disabled={busy} fullWidth>
        Annuler
      </Button>
    </AppSheet>
  );
}
