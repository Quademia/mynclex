// mynclex/app/(app)/layout.tsx
//
// Shared shell for authenticated workspace pages: /student, /tutor,
// /admin (and future feature/admin sub-routes). Route group parens
// mean the URL stays /student not /(app)/student.
//
// What the shell does:
//   - Fetches the user, their profile, their roles, and their active
//     role (from the nclex_active_role cookie).
//   - Renders the topbar (logo + role chip + user menu) and footer.
//   - Does NOT gate by role — each child page still runs its own
//     server-side role check. The shell just provides chrome.
//   - If there's no user, redirects to /login.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Topbar } from '@/components/topbar';
import { Footer } from '@/components/footer';
import { type Role } from '@/components/role-chip';
import '../tokens.css';
import '../dashboards.css';
import '../shell.css';

export const dynamic = 'force-dynamic';

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const [profileRes, rolesRes] = await Promise.all([
    supabase
      .from('nclex_users')
      .select('forename, surname, email')
      .eq('id', user.id)
      .maybeSingle(),
    supabase.from('nclex_user_roles').select('role').eq('user_id', user.id),
  ]);

  const profile = profileRes.data;
  const roles = (rolesRes.data ?? []).map((r) => r.role as Role);

  const displayName = profile
    ? `${profile.forename} ${profile.surname}`.trim()
    : user.email ?? '';

  const email = profile?.email ?? user.email ?? '';

  const cookieStore = await cookies();
  const activeRoleCookie = cookieStore.get('nclex_active_role')?.value as
    | Role
    | undefined;

  const viewingAs: Role = pickViewingAs(roles, activeRoleCookie);

  return (
    <div className="shell-root">
      <Topbar
        displayName={displayName}
        email={email}
        viewingAs={viewingAs}
        availableRoles={roles}
      />
      <div className="shell-body">{children}</div>
      <Footer />
    </div>
  );
}

// Priority order when the cookie is missing or no longer matches a held role.
const ROLE_PRIORITY: Role[] = ['SUPER_ADMIN', 'ADMIN', 'TUTOR', 'STUDENT'];

function pickViewingAs(roles: Role[], cookie: Role | undefined): Role {
  if (cookie && roles.includes(cookie)) {
    return cookie;
  }
  const fallback = ROLE_PRIORITY.find((r) => roles.includes(r));
  // `fallback` is guaranteed: if roles were empty the page would have been
  // redirected upstream; if the user reached here with zero roles and somehow
  // slipped past, we default to STUDENT to avoid a crash.
  return fallback ?? 'STUDENT';
}
