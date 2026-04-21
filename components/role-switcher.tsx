// mynclex/components/role-switcher.tsx
//
// Server Component. Renders a small "Switch to ..." group of buttons
// for each of the OTHER roles a user holds. If the user only holds one
// role, nothing renders.
//
// Each button is its own <form> posting to the switchRoleAction Server
// Action, which validates the role and sets the active-role cookie
// before redirecting.

import { switchRoleAction } from '@/app/pick-role/actions';

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'TUTOR' | 'STUDENT';

const LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  TUTOR: 'Tutor',
  STUDENT: 'Student',
};

export function RoleSwitcher({
  currentRole,
  availableRoles,
}: {
  currentRole: Role;
  availableRoles: Role[];
}) {
  const otherRoles = availableRoles.filter((r) => r !== currentRole);
  if (otherRoles.length === 0) return null;

  return (
    <div className="role-switcher">
      <div className="role-switcher-label">Switch to</div>
      <div className="role-switcher-buttons">
        {otherRoles.map((role) => (
          <form key={role} action={switchRoleAction} className="role-switcher-form">
            <input type="hidden" name="role" value={role} />
            <button type="submit" className="role-switcher-btn">
              {LABELS[role]}
            </button>
          </form>
        ))}
      </div>
    </div>
  );
}
