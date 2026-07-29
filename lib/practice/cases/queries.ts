// mynclex/lib/practice/cases/queries.ts
//
// Server-side read for the student Case Study bank.
//
// One RPC call, one round trip. `nclex_case_bank_list()` returns a single
// JSONB array rather than rows on purpose: a PostgREST table read would go
// through the client's silent 1,000-row cap, which is exactly how the CAT
// pool page came to display "1,000 / 2,880" and survived three rounds of
// tsc/vitest/SQL before a human opened the page (2026-07-29). A scalar
// JSONB return has no such ceiling.
//
// This is also where the raw scenario stops travelling: the RPC withholds
// it for locked cases, and for unlocked ones we derive the short snippet
// here so the browser receives ~260 characters instead of a full Tiptap
// document per row.

import { createClient } from '@/lib/supabase/server';
import { caseAxesLabel, caseSummarySnippet } from './derive';
import type { CaseBankRow } from './types';

/** Raw row shape as built by nclex_case_bank_list(). */
interface RawCaseRow {
  case_id: string;
  title: string;
  locked: boolean;
  seen: boolean;
  scenario: unknown;
  /** Dominant nursing subject / body system across the six children. */
  subject: string | null;
  body: string | null;
  last: { attempt_id: string; pct: number | null; ended_at: string | null } | null;
}

export async function getCaseBankRows(): Promise<CaseBankRow[]> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase.rpc('nclex_case_bank_list');
  if (error || !Array.isArray(data)) return [];

  return (data as RawCaseRow[]).map((r): CaseBankRow => ({
    caseId: r.case_id,
    title: r.title,
    locked: r.locked,
    seen: r.seen,
    axes: caseAxesLabel(r.subject, r.body),
    // Belt and braces: the RPC already nulls this for locked rows. Doing
    // it again here means a future edit to either layer alone cannot
    // start shipping exam content to the browser.
    snippet: r.locked ? null : caseSummarySnippet(r.scenario),
    last:
      r.last && r.last.pct !== null
        ? {
            attemptId: r.last.attempt_id,
            pct: Number(r.last.pct),
            endedAt: r.last.ended_at,
          }
        : null,
  }));
}
