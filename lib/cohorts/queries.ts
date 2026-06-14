// mynclex/lib/cohorts/queries.ts
//
// Server-side fetches for cohort surfaces (slices 9.2b + 9.2c).
// RLS scopes SELECT to programmes owned by the signed-in tutor
// (parent-ownership subquery — see db/rls.sql nclex_cohorts).

import { createClient } from '@/lib/supabase/server';
import type {
  Cohort,
  CohortChecklistActivityRow,
  CohortChecklistBodyEntry,
  CohortChecklistTree,
  CohortListRow,
} from './types';
import type {
  DeliveryMode,
  ProgrammeStatus,
  UnitLabel,
} from '@/lib/programmes/types';
import type {
  ProgrammeActivity,
  ProgrammeBlock,
  ProgrammeUnit,
} from '@/lib/curriculum/types';

/**
 * All cohorts of a programme, newest first. Returns [] if the
 * programme has no cohorts, or if the tutor doesn't own the
 * programme (RLS filters them out).
 */
export async function getCohortsForProgramme(
  programmeId: string
): Promise<CohortListRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('nclex_cohorts')
    .select(
      `cohort_id, programme_id, name, start_date, end_date,
       cohort_size, allow_late_join, cancelled_at,
       created_at, updated_at`
    )
    .eq('programme_id', programmeId)
    .order('start_date', { ascending: false });

  if (error || !data) return [];
  return data as CohortListRow[];
}

/**
 * Lightweight rollup — does this programme have any cohorts?
 * Used by entry-point nudges (programme card / overview) so they
 * don't have to fetch the full cohort list just to decide what to
 * render.
 *
 * Returns 0 when the programme doesn't exist or is hidden by RLS;
 * that's fine for the call sites — they're working off a programme
 * row the tutor already sees, so zero means "really has none."
 */
export async function getCohortCountForProgramme(
  programmeId: string
): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from('nclex_cohorts')
    .select('cohort_id', { count: 'exact', head: true })
    .eq('programme_id', programmeId);

  if (error || count == null) return 0;
  return count;
}

/**
 * Lookup for the cohort-scoped shell (slice 9.2c). Returns the
 * cohort row plus the parent programme's identity / shape fields
 * that drive the shell + sidebar + back-pill.
 *
 * RLS scopes both joined rows to the signed-in tutor (cohort via
 * parent-ownership subquery, programme via tutor_id check).
 * Returns null if the cohort doesn't exist OR the tutor doesn't
 * own its parent programme; the shell turns null into a 404.
 *
 * Invalid UUIDs in the URL also return null.
 */
export type CohortShellContext = {
  cohort: Cohort;
  programme: {
    programme_id: string;
    title: string;
    delivery_mode: DeliveryMode;
    unit_label: UnitLabel;
    length_units: number;
  };
};

export async function getCohortForShell(
  cohortId: string
): Promise<CohortShellContext | null> {
  const supabase = await createClient();

  // Embedded select pulls the parent programme in the same round
  // trip; PostgREST returns the programme as a nested object.
  const { data, error } = await supabase
    .from('nclex_cohorts')
    .select(
      `cohort_id, programme_id, name, start_date, end_date,
       cohort_size, allow_late_join, cancelled_at,
       created_at, updated_at,
       nclex_programmes!inner(
         programme_id, title, delivery_mode, unit_label, length_units
       )`
    )
    .eq('cohort_id', cohortId)
    .maybeSingle();

  if (error || !data) return null;

  // PostgREST returns the embedded row either as a single object
  // or as an array depending on the relationship inference; the
  // FK relationship here is many-to-one so it's always one row,
  // but we defensively handle both shapes.
  const programmeRaw = (data as typeof data & {
    nclex_programmes:
      | CohortShellContext['programme']
      | CohortShellContext['programme'][]
      | null;
  }).nclex_programmes;
  const programme = Array.isArray(programmeRaw) ? programmeRaw[0] : programmeRaw;
  if (!programme) return null;

  const {
    cohort_id, programme_id, name, start_date, end_date, cohort_size,
    allow_late_join, cancelled_at, created_at, updated_at,
  } = data as Cohort;

  return {
    cohort: {
      cohort_id, programme_id, name, start_date, end_date, cohort_size,
      allow_late_join, cancelled_at, created_at, updated_at,
    },
    programme,
  };
}

// =====================================================================
// Slice 9.3f — Cohort curriculum checklist
// =====================================================================
//
// Fetches the full grouped tree the Curriculum tab renders:
//   units (in unit_index order)
//     → body entries (blocks + loose rows interleaved by ordinal)
//       → in-block rows (in template-ordinal order)
//
// Two waves of queries:
//   Wave 1: cohort + parent programme (one round trip).
//   Wave 2: units + blocks + checklist-with-joined-activity rows
//           (three parallel round trips).
//
// Cohort row count grows linearly with template activities (one row
// per template activity), so the wave-2 reads are O(template size)
// — same order of magnitude as the curriculum tab on the tutor side.
// No N+1 risk; composition happens entirely in TS.
//
// Returns null when the cohort doesn't exist or the tutor doesn't
// own its parent programme.

export async function getCohortChecklist(
  cohortId: string
): Promise<CohortChecklistTree | null> {
  const supabase = await createClient();

  // Wave 1 — cohort with parent programme. RLS gates both.
  const { data: cohortRow, error: cohortError } = await supabase
    .from('nclex_cohorts')
    .select(
      `cohort_id, programme_id, start_date, name,
       nclex_programmes!inner(
         programme_id, title, status, unit_label, delivery_mode
       )`
    )
    .eq('cohort_id', cohortId)
    .maybeSingle();

  if (cohortError || !cohortRow) return null;

  const programmeRaw = (cohortRow as typeof cohortRow & {
    nclex_programmes:
      | {
          programme_id: string;
          title: string;
          status: ProgrammeStatus;
          unit_label: UnitLabel;
          delivery_mode: DeliveryMode;
        }
      | Array<{
          programme_id: string;
          title: string;
          status: ProgrammeStatus;
          unit_label: UnitLabel;
          delivery_mode: DeliveryMode;
        }>
      | null;
  }).nclex_programmes;
  const programme = Array.isArray(programmeRaw)
    ? programmeRaw[0]
    : programmeRaw;
  if (!programme) return null;

  // Wave 2 — units, blocks, the cohort's checklist OVERRIDE rows, and
  // the full live template activity list. The checklist is the live
  // template (4th read); override rows (3rd read) only supply
  // inclusion + dates for activities the tutor has configured.
  // The blocks + activities reads cover BOTH the shared template
  // (cohort_id IS NULL) AND this cohort's own cohort-only adds
  // (cohort_id = this cohort) — never another cohort's. The `.or`
  // scope is what keeps one cohort's escape-valve content out of
  // every other cohort's checklist.
  const cohortScope = `cohort_id.is.null,cohort_id.eq.${cohortId}`;
  const [unitsResult, blocksResult, overridesResult, activitiesResult] =
    await Promise.all([
    supabase
      .from('nclex_programme_units')
      .select(
        `unit_id, programme_id, unit_index, title, description,
         is_published, created_at, updated_at`
      )
      .eq('programme_id', programme.programme_id)
      .order('unit_index', { ascending: true }),
    supabase
      .from('nclex_programme_blocks')
      .select(
        `block_id, unit_id, ordinal, title, description,
         is_published, created_at, updated_at, cohort_id,
         nclex_programme_units!inner(programme_id)`
      )
      .eq('nclex_programme_units.programme_id', programme.programme_id)
      .or(cohortScope)
      .order('ordinal', { ascending: true }),
    supabase
      .from('nclex_cohort_checklist_items')
      .select(
        `template_activity_id, is_included, release_date, due_date, close_date`
      )
      .eq('cohort_id', cohortId),
    supabase
      .from('nclex_programme_activities')
      .select(
        `activity_id, unit_id, block_id, ordinal, type, title,
         description, note, payload, is_published, created_at, updated_at,
         cohort_id,
         nclex_programme_units!inner(programme_id)`
      )
      .eq('nclex_programme_units.programme_id', programme.programme_id)
      .or(cohortScope)
      .order('ordinal', { ascending: true }),
  ]);

  const units = (unitsResult.data ?? []) as ProgrammeUnit[];
  const blocks = (blocksResult.data ?? []) as Array<
    ProgrammeBlock & {
      nclex_programme_units?: unknown; // strip embed before render
      cohort_id?: string | null; // drives isCohortOnly, not on ProgrammeBlock
    }
  >;
  // Which blocks are cohort-only (cohort_id set) vs shared template.
  const isCohortOnlyByBlock = new Map<string, boolean>();
  for (const b of blocks) {
    isCohortOnlyByBlock.set(b.block_id, b.cohort_id != null);
  }

  // Override rows, keyed by activity. Absence = unconfigured.
  type OverrideRow = {
    template_activity_id: string;
    is_included: boolean;
    release_date: string;
    due_date: string | null;
    close_date: string | null;
  };
  const overridesByActivity = new Map<string, OverrideRow>();
  for (const o of (overridesResult.data ?? []) as OverrideRow[]) {
    overridesByActivity.set(o.template_activity_id, o);
  }

  // Week-pacing default release for an activity with no override.
  const DAY_MS = 86_400_000;
  const cohortStartMs = new Date(`${cohortRow.start_date}T00:00:00Z`).getTime();
  const unitIndexById = new Map(units.map((u) => [u.unit_id, u.unit_index]));
  const defaultRelease = (unitId: string): string => {
    const unitIndex = unitIndexById.get(unitId) ?? 1;
    return new Date(cohortStartMs + (unitIndex - 1) * 7 * DAY_MS)
      .toISOString()
      .slice(0, 10);
  };

  // Build one checklist row per LIVE template activity, attaching its
  // override or computed defaults. This is the heart of the live model:
  // the list is driven by the template, not by which rows exist.
  const checklistRows: CohortChecklistActivityRow[] = (
    (activitiesResult.data ?? []) as Array<
      ProgrammeActivity & {
        nclex_programme_units?: unknown;
        cohort_id?: string | null;
      }
    >
  ).map((raw) => {
    // Strip the join embed AND cohort_id off the activity — cohort_id
    // drives the isCohortOnly flag but isn't part of the ProgrammeActivity
    // surface; the rest is a clean template-shaped activity row.
    const { nclex_programme_units: _omit, cohort_id, ...activity } = raw;
    const isCohortOnly = cohort_id != null;
    const override = overridesByActivity.get(activity.activity_id);
    if (override) {
      return {
        activity: activity as ProgrammeActivity,
        state: override.is_included ? 'included' : 'excluded',
        release_date: override.release_date,
        due_date: override.due_date,
        close_date: override.close_date,
        release_is_default: false,
        isCohortOnly,
      } satisfies CohortChecklistActivityRow;
    }
    return {
      activity: activity as ProgrammeActivity,
      state: 'unconfigured',
      release_date: defaultRelease(activity.unit_id),
      due_date: null,
      close_date: null,
      release_is_default: true,
      isCohortOnly,
    } satisfies CohortChecklistActivityRow;
  });

  // Group: per unit → body entries (blocks + loose rows interleaved
  // by ordinal). Inside each block, in-block rows sorted by
  // activity.ordinal. Loose rows + blocks share the same unit-body
  // ordinal sequence (same as the tutor-side composeUnitBody).
  const blocksByUnit = new Map<string, ProgrammeBlock[]>();
  for (const b of blocks) {
    const clean: ProgrammeBlock = {
      block_id: b.block_id,
      unit_id: b.unit_id,
      ordinal: b.ordinal,
      title: b.title,
      description: b.description,
      is_published: b.is_published,
      created_at: b.created_at,
      updated_at: b.updated_at,
    };
    const arr = blocksByUnit.get(b.unit_id) ?? [];
    arr.push(clean);
    blocksByUnit.set(b.unit_id, arr);
  }

  const rowsByUnit = new Map<string, CohortChecklistActivityRow[]>();
  for (const r of checklistRows) {
    const arr = rowsByUnit.get(r.activity.unit_id) ?? [];
    arr.push(r);
    rowsByUnit.set(r.activity.unit_id, arr);
  }

  const unitTrees = units.map((unit) => {
    const unitBlocks = blocksByUnit.get(unit.unit_id) ?? [];
    const unitRows = rowsByUnit.get(unit.unit_id) ?? [];

    // Split rows into loose vs in-block.
    const looseRows: CohortChecklistActivityRow[] = [];
    const rowsByBlock = new Map<string, CohortChecklistActivityRow[]>();
    for (const r of unitRows) {
      if (r.activity.block_id === null) {
        looseRows.push(r);
      } else {
        const arr = rowsByBlock.get(r.activity.block_id) ?? [];
        arr.push(r);
        rowsByBlock.set(r.activity.block_id, arr);
      }
    }

    // Compose the body: blocks + loose rows interleaved by ordinal.
    // Blocks carry their own ordinal; loose rows use the activity's
    // ordinal (which lives in the same unit-body sequence per the
    // 9.3c reorder model).
    type Sortable =
      | { kind: 'block'; ordinal: number; block: ProgrammeBlock }
      | {
          kind: 'loose';
          ordinal: number;
          row: CohortChecklistActivityRow;
        };
    const sortables: Sortable[] = [];
    for (const b of unitBlocks) {
      sortables.push({ kind: 'block', ordinal: b.ordinal, block: b });
    }
    for (const r of looseRows) {
      sortables.push({ kind: 'loose', ordinal: r.activity.ordinal, row: r });
    }
    sortables.sort((a, b) => a.ordinal - b.ordinal);

    const body: CohortChecklistBodyEntry[] = sortables.map((e) => {
      if (e.kind === 'block') {
        const blockRows = (rowsByBlock.get(e.block.block_id) ?? []).sort(
          (x, y) => x.activity.ordinal - y.activity.ordinal
        );
        return {
          kind: 'block',
          block: e.block,
          rows: blockRows,
          isCohortOnly: isCohortOnlyByBlock.get(e.block.block_id) ?? false,
        };
      }
      return { kind: 'loose', row: e.row };
    });

    return { unit, body };
  });

  return {
    cohort: {
      cohort_id: cohortRow.cohort_id,
      programme_id: cohortRow.programme_id,
      start_date: cohortRow.start_date,
      name: cohortRow.name,
    },
    programme: {
      programme_id: programme.programme_id,
      title: programme.title,
      status: programme.status,
      unit_label: programme.unit_label,
      delivery_mode: programme.delivery_mode,
    },
    units: unitTrees,
  };
}
