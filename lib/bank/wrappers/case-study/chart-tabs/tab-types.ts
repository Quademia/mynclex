// mynclex/lib/bank/case-study/tab-types.ts
//
// Hardcoded registry of the 6 built-in case-study chart-tab types
// (Slice 1.11a). Mirrors the mockup's Section 3 shape overview.
//
// Why hardcoded (not a DB lookup table):
//   - Adding a built-in tab also needs a structured editor + renderer —
//     both require code. A DB registry would mark tabs "available"
//     without giving them editors, which is partial automation worse
//     than none.
//   - The set is small and stable. Promote to a DB table later if
//     curators start asking for new built-ins without a deploy.
//
// Custom tabs do NOT go in this registry. They live in the
// nclex_case_study_tabs row itself, carrying one of two custom
// tab_key values — 'custom_narrative' (free-text cards) or
// 'custom_grid' (curator-defined columns).

// ─────────────────────────────────────────────────────────────
// Shape discriminator. Since Slice 5 it only drives how a built-in seeds
// its v2 blob when added from the picker (seedEntriesForBuiltIn):
//   - 'narrative'  → a blank v2 narrative tab
//   - 'structured' → a v2 merge table seeded with the columns as a heading row
// ─────────────────────────────────────────────────────────────

export type TabShape = 'narrative' | 'structured';

export interface BuiltInColumn {
  id:    string;
  label: string;
}

// Fields that appear on each narrative entry beyond Time + Body +
// visible_from. e.g. Orders carries a 'status' select; H&P carries
// a 'section' select; Diagnostics carries a 'test_type' text field.
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
  // Present only when shape === 'structured'.
  columns?:      BuiltInColumn[];
  // Narrative-tab extras (beyond time + body). Present only when
  // shape === 'narrative'.
  extra_fields?: BuiltInExtraField[];
  // When true, the narrative editor hides the Time control. History
  // & Physical uses Section (from extra_fields) instead of time.
  omit_time?:    boolean;
}

// ─────────────────────────────────────────────────────────────
// The six built-ins — shape mirrored from the mockup's Section 3.0.
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
// Custom-tab discriminators. These live on the tab row's tab_key
// column (not in the registry above) and pair with custom_shape:
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

// Pair a custom tab_key with its matching custom_shape. Guards against
// the custom_narrative/rows_cols + custom_grid/free_text mismatch.
export function customShapeForKey(key: CustomTabKey): CustomShape {
  return key === 'custom_narrative' ? 'free_text' : 'rows_cols';
}

export function customKeyForShape(shape: CustomShape): CustomTabKey {
  return shape === 'free_text' ? 'custom_narrative' : 'custom_grid';
}
