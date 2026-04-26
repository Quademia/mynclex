// mynclex/lib/auth/constants.ts
//
// Permission-bucket constants. Use these (not bare string literals)
// when calling requireAdminPermission so typos surface as TS errors
// instead of silent runtime bounces.
//
// Adding a new permission bucket: add the constant here, add it to
// the AdminPermission union, seed a row in nclex_admin_permissions
// for the relevant admins, and use the constant at the call site.
// One edit, three places that have to be in sync — TS will catch
// any miss at compile time.

export const PERM_BANK_CURATE     = 'BANK_CURATE'     as const;
export const PERM_USERS_MANAGE    = 'USERS_MANAGE'    as const;
export const PERM_TUTORS_MANAGE   = 'TUTORS_MANAGE'   as const;
export const PERM_PROGRAMMES_VIEW = 'PROGRAMMES_VIEW' as const;
export const PERM_PAYMENTS_MANAGE = 'PAYMENTS_MANAGE' as const;
export const PERM_COMMS_MANAGE    = 'COMMS_MANAGE'    as const;
export const PERM_SYSTEM_MANAGE   = 'SYSTEM_MANAGE'   as const;

export type AdminPermission =
  | typeof PERM_BANK_CURATE
  | typeof PERM_USERS_MANAGE
  | typeof PERM_TUTORS_MANAGE
  | typeof PERM_PROGRAMMES_VIEW
  | typeof PERM_PAYMENTS_MANAGE
  | typeof PERM_COMMS_MANAGE
  | typeof PERM_SYSTEM_MANAGE;
