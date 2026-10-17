// Rôles du staff et droit de trancher (lot 35a) : les cases du site (`RoleBoxes` + « Peut aider à trancher »), dans une
// feuille. Utilisé pour accepter une demande, inviter, modifier un membre et ajuster un événement.
import { CheckboxField } from "@orasso/design-system/native";
import { orgaManageLabels as L, type StaffRole, staffRoleLabels, staffRoles } from "@orasso/shared";

import { toggleRole } from "@/lib/orga";
import { Muted } from "@/ui/Muted";

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
        <CheckboxField
          key={role}
          label={staffRoleLabels[role]}
          checked={roles.includes(role)}
          disabled={disabled}
          onChange={() => onRoles(toggleRole(roles, role, staffRoles))}
        />
      ))}
      <CheckboxField label={L.canDecide} checked={canDecide} disabled={disabled} onChange={onCanDecide} />
    </>
  );
}
