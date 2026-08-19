// mynclex/app/(app)/admin/config/config-defs.ts
//
// The known system-config settings, declared once. nclex_config is a plain
// key/value (text) table — the database has no notion that one key is a
// yes/no and another a percentage. That meaning lives HERE: each entry says
// what a key means, what type it is, and how to validate it. The page renders
// the right control per type; the save action validates against the same defs.
// Keys are code-defined and read-only — you don't add/rename keys from the UI,
// only edit values. Pure data + pure helpers (no server imports) so both the
// server action and the client board can use it.

export type ConfigType = 'boolean' | 'percent' | 'integer';

export interface ConfigDef {
  key: string;
  label: string;
  description: string;
  type: ConfigType;
  // Fallback when the row is somehow missing (rows are normally seeded).
  defaultValue: string;
  // boolean only: a warning shown before turning the setting OFF, when doing
  // so is consequential.
  confirmOff?: string;
  // integer only: inclusive admin-input guard rails (a typo can't set an
  // absurd value). Within these the admin sets whatever they like.
  min?: number;
  max?: number;
}

export const CONFIG_DEFS: ConfigDef[] = [
  {
    key: 'enrolment_sweep_enabled',
    label: 'Nightly enrolment sweep',
    description:
      'Runs the automatic overdue-pause and access-expiry checks each night at 02:00 UTC. Access is always enforced live regardless — turning this off only stops the stored statuses from updating.',
    type: 'boolean',
    defaultValue: 'true',
    confirmOff:
      'This stops the nightly job that pauses overdue students and expires ended enrolments/subscriptions. Live access checks still apply, but stored statuses (and the tutor roster) will stop updating until you turn it back on.',
  },
  {
    key: 'cat_recalibration_enabled',
    label: 'Weekly difficulty recalibration',
    description:
      'Measures every question’s difficulty from how students actually answered it, each Sunday at 02:00 UTC. A question needs 30 answers before its difficulty can move, so this does nothing until the bank has been used.',
    type: 'boolean',
    defaultValue: 'true',
    confirmOff:
      'This stops the weekly job that keeps question difficulty in step with real student performance. Nothing breaks — every question keeps the difficulty it last had — but the adaptive exam will go on matching students against increasingly out-of-date numbers until you turn it back on.',
  },
  {
    key: 'item_stats_enabled',
    label: 'Question statistics',
    description:
      'Counts how students have answered each question and shows it under their answer in review, refreshed nightly at 03:00 UTC. A question needs 30 answers before a student sees anything, so this does nothing until the bank has been used.',
    type: 'boolean',
    defaultValue: 'true',
    // Unlike the two job switches above, this one governs the DISPLAY as
    // well as the nightly recount. Stopping the job alone would freeze
    // the last numbers on screen rather than remove them — the wrong
    // outcome for the reason an admin would most likely reach for it.
    confirmOff:
      'This hides the figure from students, and from tutors on their own questions, and stops the nightly recount. Nothing is lost: the counts are rebuilt from the answers themselves the night after you turn it back on.',
  },
  {
    key: 'email_drain_enabled',
    label: 'Scheduled email delivery',
    description:
      'Checks the email queue every five minutes and sends whatever has come due — both email queued by a nightly job and retries of sends that failed. Receipts and enrolment emails do not wait for this: they go out on the student’s own visit, in seconds.',
    type: 'boolean',
    defaultValue: 'true',
    // ⚠ The only off switch this job has. It runs every five minutes, so
    // without an entry here stopping it would mean editing the database by
    // hand — which is the thing the other three switches exist to avoid.
    confirmOff:
      'This stops all scheduled email and all automatic retries. Receipts and enrolment emails still send normally. But anything a nightly job queues — payment reminders, access-expiry notices — will sit unsent until you turn this back on, and a failed send will only go out if you press Retry on the Emails page yourself.',
  },
  {
    key: 'session_reminders_enabled',
    label: 'Live-class reminders',
    description:
      'Each morning at 07:00, emails every student whose live class falls in the next seven days — once per class, with a calendar file attached so their own phone reminds them nearer the time. Tutors can also send one reminder per class by hand from the cohort’s Sessions tab; that button is not affected by this switch.',
    type: 'boolean',
    defaultValue: 'true',
    // ⚠ THE SWITCH MUST EXIST HERE OR IT EFFECTIVELY DOES NOT EXIST. The
    // page renders CONFIG_DEFS, not the nclex_config table — a row added
    // by a migration and not listed here is invisible, and turning it off
    // would mean editing the database by hand. `email_drain_enabled` was
    // missed exactly this way on its first pass.
    //
    // ⓘ It has a real deployment use, not just a panic use: a new
    // environment must keep this OFF until the session.reminder template
    // is deployed there, or the morning pass queues rows that environment
    // can only mark DEAD.
    confirmOff:
      'Students will stop being told about their live classes. Nothing is lost and nothing needs catching up — the morning pass only ever emails students it has not already told, so whoever was missed while this was off is picked up by the first run after you turn it back on. Tutors can still send a reminder by hand in the meantime.',
  },
  {
    key: 'bank_optin_discount',
    label: 'Bank opt-in discount',
    description:
      'Discount applied to the NCLEX Bank add-on when a student buys it alongside a programme at checkout.',
    type: 'percent',
    defaultValue: '0',
  },
  {
    key: 'embed_max_questions_per_block',
    label: 'Embedded questions — max per block',
    description:
      'The most questions a single embedded-questions block in a library note can hold. The picker stops the tutor at this number.',
    type: 'integer',
    defaultValue: '10',
    min: 1,
    max: 30,
  },
  {
    key: 'embed_max_blocks_per_note',
    label: 'Embedded questions — max blocks per note',
    description:
      'The most embedded-questions blocks a single library note can contain. Beyond this the “Embedded questions” block option is disabled. (Max questions per note = this × the per-block limit.)',
    type: 'integer',
    defaultValue: '5',
    min: 1,
    max: 10,
  },
];

export function configDef(key: string): ConfigDef | undefined {
  return CONFIG_DEFS.find((d) => d.key === key);
}

// A stored fraction string ('0.4') → whole-percent number (40) for display/edit.
export function fractionToPercent(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

// A whole-percent number (40) → stored fraction string ('0.4').
export function percentToFraction(percent: number): string {
  return String(percent / 100);
}

// Human-readable current value for a tile.
export function formatConfigValue(def: ConfigDef, value: string): string {
  switch (def.type) {
    case 'boolean':
      return value === 'true' ? 'On' : 'Off';
    case 'percent':
      return `${fractionToPercent(value)}%`;
    case 'integer':
      return value;
  }
}

// A stored integer-config string → number, clamped to its def's guard rails,
// falling back to the default if missing / malformed. The single read path
// for the consuming code so a bad row can never produce a bad limit.
export function readIntegerConfig(def: ConfigDef, value: string | undefined): number {
  const n = Number(value);
  const min = def.min ?? 1;
  const max = def.max ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isInteger(n)) return Number(def.defaultValue);
  return Math.min(max, Math.max(min, n));
}

// Validate + normalise a stored-form value against its def. The action calls
// this before writing, so a bad value can never reach the table.
export function validateConfigValue(
  def: ConfigDef,
  value: string
): { ok: true; value: string } | { ok: false; error: string } {
  switch (def.type) {
    case 'boolean':
      return value === 'true' || value === 'false'
        ? { ok: true, value }
        : { ok: false, error: 'Value must be on or off.' };
    case 'percent': {
      const n = Number(value);
      // The consuming code treats this as a fraction in [0, 1).
      if (!Number.isFinite(n) || n < 0 || n >= 1) {
        return { ok: false, error: 'Discount must be between 0% and 99%.' };
      }
      return { ok: true, value: String(n) };
    }
    case 'integer': {
      const n = Number(value);
      const min = def.min ?? 1;
      const max = def.max ?? Number.MAX_SAFE_INTEGER;
      if (!Number.isInteger(n) || n < min || n > max) {
        return { ok: false, error: `Must be a whole number between ${min} and ${max}.` };
      }
      return { ok: true, value: String(n) };
    }
  }
}
