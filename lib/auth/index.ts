// mynclex/lib/auth/index.ts
//
// Public API of lib/auth. Pages and Server Actions should import from
// '@/lib/auth' (not the deep sub-paths) so the helper set is
// rediscoverable and the implementation paths can move without
// breaking call sites.
//
// `internal.ts` and the audience-folder modules are NOT re-exported
// here — they're module-internal. If you find yourself wanting to
// import from a deep path, the helper you need probably belongs in
// the public API; add it to this barrel instead.

// Admin
export { requireAdminPermission } from './admin/require-permission';
export { requireSuperAdmin }       from './admin/require-super-admin';
export { requireAnyAdmin }         from './admin/require-any-admin';

// Tutor
export { requireTutor } from './tutor/require-tutor';

// Shared (cross-audience)
export { requireBankCurator } from './shared/require-bank-curator';
export type { BankSurface }   from './shared/require-bank-curator';

// Types and constants
export type { AuthGateResult, ServerSupabaseClient } from './types';
export type { AdminPermission } from './constants';
export {
  PERM_BANK_CURATE,
  PERM_USERS_MANAGE,
  PERM_TUTORS_MANAGE,
  PERM_PROGRAMMES_VIEW,
  PERM_PAYMENTS_MANAGE,
  PERM_COMMS_MANAGE,
  PERM_SYSTEM_MANAGE,
} from './constants';
