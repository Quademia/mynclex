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
