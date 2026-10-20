// Rôles du staff et droit de trancher (lot 35a) : les cases du site (`RoleBoxes` + « Peut aider à trancher »), dans une
// feuille. Utilisé pour accepter une demande, inviter, modifier un membre et ajuster un événement.
import { CheckboxField } from "@orasso/design-system/native";
import { orgaManageLabels as L, orgaV2Labels, type StaffRole, staffRoleLabels, staffRoles } from "@orasso/shared";
import { StyleSheet, View } from "react-native";

import { toggleRole } from "@/lib/orga";
import { Muted } from "@/ui/Muted";

const styles = StyleSheet.create({ role: { gap: 2 } });

export function RolePicker({
  roles,
  canDecide,
  onRoles,
  onCanDecide,
  disabled = false,
}: {
  roles: readonly StaffRole[];
  canDecide: boolean;
  onRoles: (next: StaffRole[]) => void;
  onCanDecide: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <>
      <Muted variant="label">{L.rolesLegend}</Muted>
      {staffRoles.map((role) => (
        <View key={role} style={styles.role}>
          <CheckboxField
            label={staffRoleLabels[role]}
            checked={roles.includes(role)}
            disabled={disabled}
            onChange={() => onRoles(toggleRole(roles, role, staffRoles))}
          />
          {/* Lot 52 : ce que le rôle permet (depuis le lot 48, seuls certains rôles pointent les entrées). */}
          <Muted variant="caption">{orgaV2Labels.roleAllows[role]}</Muted>
        </View>
      ))}
      <CheckboxField label={L.canDecide} checked={canDecide} disabled={disabled} onChange={onCanDecide} />
    </>
  );
}
