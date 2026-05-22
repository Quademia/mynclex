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

export type ConfigType = 'boolean' | 'percent';

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
  }
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
  }
}
