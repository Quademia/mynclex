-- =========================================================
-- MyNclex — RLS policies & helper functions
-- File: mynclex/db/rls.sql
-- =========================================================

-- ─────────────────────────────────────────────────────────
-- HELPER FUNCTIONS
-- SECURITY DEFINER avoids recursive RLS evaluation.
-- ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION nclex_user_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid();
$$;

CREATE OR REPLACE FUNCTION nclex_user_has_role(check_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM nclex_user_roles
    WHERE user_id = auth.uid() AND role = check_role
  );
$$;

CREATE OR REPLACE FUNCTION nclex_user_has_permission(check_permission TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    EXISTS (SELECT 1 FROM nclex_user_roles WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN')
    OR
    EXISTS (SELECT 1 FROM nclex_admin_permissions WHERE user_id = auth.uid() AND permission = check_permission);
$$;


-- ─────────────────────────────────────────────────────────
-- ENABLE RLS
-- ─────────────────────────────────────────────────────────

ALTER TABLE nclex_users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE nclex_user_roles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE nclex_admin_permissions  ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────
-- nclex_users
-- ─────────────────────────────────────────────────────────

CREATE POLICY nclex_users_self_read ON nclex_users FOR SELECT
  USING (id = auth.uid() OR nclex_user_has_role('SUPER_ADMIN'));

CREATE POLICY nclex_users_self_update ON nclex_users FOR UPDATE
  USING (id = auth.uid() OR nclex_user_has_role('SUPER_ADMIN'));

CREATE POLICY nclex_users_self_insert ON nclex_users FOR INSERT
  WITH CHECK (id = auth.uid() OR nclex_user_has_role('SUPER_ADMIN'));

CREATE POLICY nclex_users_admin_delete ON nclex_users FOR DELETE
  USING (nclex_user_has_role('SUPER_ADMIN'));


-- ─────────────────────────────────────────────────────────
-- nclex_user_roles
-- ─────────────────────────────────────────────────────────

CREATE POLICY nclex_roles_self_read ON nclex_user_roles FOR SELECT
  USING (user_id = auth.uid() OR nclex_user_has_role('SUPER_ADMIN'));

CREATE POLICY nclex_roles_self_insert_student ON nclex_user_roles FOR INSERT
  WITH CHECK (user_id = auth.uid() AND role = 'STUDENT');

CREATE POLICY nclex_roles_admin_write ON nclex_user_roles FOR ALL
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));


-- ─────────────────────────────────────────────────────────
-- nclex_admin_permissions
-- ─────────────────────────────────────────────────────────

CREATE POLICY nclex_perms_self_read ON nclex_admin_permissions FOR SELECT
  USING (user_id = auth.uid() OR nclex_user_has_role('SUPER_ADMIN'));

CREATE POLICY nclex_perms_admin_write ON nclex_admin_permissions FOR ALL
  USING (nclex_user_has_role('SUPER_ADMIN'))
  WITH CHECK (nclex_user_has_role('SUPER_ADMIN'));
