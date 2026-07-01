// mynclex/lib/bank/wrappers/trend/tab-types.ts
//
// Trend's copy of the chart-tab registry (mirror of the case-study
// tab-types.ts). Trend owns its own copy so the two wrappers stay
// independent (mirror, don't share) — only the low-level rich editors in
// lib/authoring/ are shared. The built-in set is identical to case study
// (the corpus trends are made of the same chart shapes); trend retired
// its old `kind` presets in favour of these.
//
// Custom tabs do NOT go in this registry. They live in the
// nclex_trend_tabs row itself, carrying one of two custom tab_key values —
// 'custom_narrative' (free-text cards) or 'custom_grid' (curator table).

// ─────────────────────────────────────────────────────────────
// Shape discriminator. Drives how a built-in seeds its v2 blob when
// added from the picker (seedEntriesForBuiltIn):
//   - 'narrative'  → a blank v2 narrative tab
//   - 'structured' → a v2 merge table seeded with the columns as a heading row
// ─────────────────────────────────────────────────────────────

export type TabShape = 'narrative' | 'structured';

export interface BuiltInColumn {
  id:    string;
  label: string;
}

// Fields that appear on each narrative entry beyond Time + Body.
export interface BuiltInExtraField {
  id:       string;
  label:    string;
  kind:     'select' | 'text';
  options?: string[];     // populated only when kind === 'select'
}

export interface BuiltInTabType {
  tab_key:       string;             // stable machine name
  default_title: string;             // curator-facing label at creation
  shape:         TabShape;
  // Structured-tab columns (including a 'time' column where it exists).
  columns?:      BuiltInColumn[];
  // Narrative-tab extras (beyond time + body).
  extra_fields?: BuiltInExtraField[];
  // When true, the narrative editor hides the Time control.
  omit_time?:    boolean;
}

// ─────────────────────────────────────────────────────────────
// The six built-ins — identical set to case study.
// Order here is the suggested order in the add-tab popover.
// ─────────────────────────────────────────────────────────────

export const BUILT_IN_TABS: readonly BuiltInTabType[] = [
  {
    tab_key:       'nurses_notes',
    default_title: "Nurses' Notes",
    shape:         'narrative',
  },
  {
    tab_key:       'vital_signs',
    default_title: 'Vital Signs',
    shape:         'structured',
    columns: [
      { id: 'time', label: 'Time' },
      { id: 'bp',   label: 'BP'   },
      { id: 'hr',   label: 'HR'   },
      { id: 'rr',   label: 'RR'   },
      { id: 'spo2', label: 'SpO₂' },
      { id: 'temp', label: 'Temp' },
      { id: 'pain', label: 'Pain' },
    ],
  },
  {
    tab_key:       'lab_results',
    default_title: 'Lab Results',
    shape:         'structured',
    columns: [
      { id: 'time',      label: 'Time'      },
      { id: 'test',      label: 'Test'      },
      { id: 'value',     label: 'Value'     },
      { id: 'unit',      label: 'Unit'      },
      { id: 'reference', label: 'Reference' },
      { id: 'flag',      label: 'Flag'      },
    ],
  },
  {
    tab_key:       'orders',
    default_title: 'Orders',
    shape:         'narrative',
    extra_fields: [
      {
        id:      'status',
        label:   'Status',
        kind:    'select',
        options: ['Active', 'Completed', 'Discontinued', 'Held'],
      },
    ],
  },
  {
    tab_key:       'history',
    default_title: 'History & Physical',
    shape:         'narrative',
    omit_time:     true,
    extra_fields: [
      {
        id:    'section',
        label: 'Section',
        kind:  'select',
        options: [
          'Past medical',
          'Past surgical',
          'Social',
          'Family',
          'Allergies',
          'Medications',
          'Review of systems',
        ],
      },
    ],
  },
  {
    tab_key:       'diagnostics',
    default_title: 'Diagnostics',
    shape:         'narrative',
    extra_fields: [
      { id: 'test_type', label: 'Test', kind: 'text' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// Custom-tab discriminators.
//   - custom_narrative ↔ custom_shape = 'free_text'
//   - custom_grid      ↔ custom_shape = 'rows_cols'
// ─────────────────────────────────────────────────────────────

export const CUSTOM_TAB_KEYS = ['custom_narrative', 'custom_grid'] as const;
export type CustomTabKey = typeof CUSTOM_TAB_KEYS[number];

export type CustomShape = 'free_text' | 'rows_cols';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

export function getTabType(tab_key: string): BuiltInTabType | null {
  return BUILT_IN_TABS.find((t) => t.tab_key === tab_key) ?? null;
}

export function isBuiltIn(tab_key: string): boolean {
  return BUILT_IN_TABS.some((t) => t.tab_key === tab_key);
}

export function isCustomTabKey(tab_key: string): tab_key is CustomTabKey {
  return (CUSTOM_TAB_KEYS as readonly string[]).includes(tab_key);
}

export function customShapeForKey(key: CustomTabKey): CustomShape {
  return key === 'custom_narrative' ? 'free_text' : 'rows_cols';
}

export function customKeyForShape(shape: CustomShape): CustomTabKey {
  return shape === 'free_text' ? 'custom_narrative' : 'custom_grid';
}
