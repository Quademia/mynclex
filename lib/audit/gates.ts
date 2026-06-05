// mynclex/lib/audit/gates.ts
//
// Access-gate registry for reading audit history. The audit module is
// surface-agnostic (keyed on realm + entity_type), so the ONE thing
// that differs per content family is "who is allowed to read this
// entity's change history" — that lives here, decoupled from the rest.
//
// To fold in a new surface (library, quizzes, programmes — Step 3 of
// docs/product-plan/audit-log.md): add the DB trigger on its table,
// then register its entity_type → gate here. Nothing else in lib/audit
// changes.
//
// Note: this is layered on top of the log tables' own RLS (admin log =
// BANK_CURATE; tutor log = owner + SUPER_ADMIN). The gate is the TS-side
// mirror of that SQL policy — the standing "gate at every layer" rule.

import { requireBankCurator, type AuthGateResult } from '@/lib/access';

/** A gate returns the authenticated, request-scoped context (we use its
 *  RLS-respecting supabase client to read the log). */
type AuditGate = () => Promise<AuthGateResult>;

// entity_type → the gate guarding its history. Bank's six tables use the
// surface-aware bank-curator gate; future surfaces add their own line
// (e.g. library_note: () => requireTutor()).
const GATES: Record<string, AuditGate> = {
  // Admin / QAcademy bank realm — BANK_CURATE (or SUPER_ADMIN).
  case_study:          () => requireBankCurator('admin'),
  trend_dataset:       () => requireBankCurator('admin'),
  bank_item:           () => requireBankCurator('admin'),
  // Tutor bank realm — is-a-tutor (or SUPER_ADMIN); RLS scopes to owner.
  tutor_case_study:    () => requireBankCurator('tutor'),
  tutor_trend_dataset: () => requireBankCurator('tutor'),
  tutor_question:      () => requireBankCurator('tutor'),
};

/**
 * Resolve and run the access gate for an audited entity type. Throws if
 * the type has no registered gate — a loud failure beats silently
 * leaking history for an unguarded surface.
 */
export async function resolveAuditGate(entityType: string): Promise<AuthGateResult> {
  const gate = GATES[entityType];
  if (!gate) {
    throw new Error(`No audit access gate registered for entity_type "${entityType}".`);
  }
  return gate();
}
