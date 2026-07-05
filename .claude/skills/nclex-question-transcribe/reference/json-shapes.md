# JSON shape library

Exact stored shapes, pulled from Sam's authored `NCLEX_CS_00015` (Tension
pneumothorax) and `NCLEX_TRD_00001` on prod. Reproduce these; do not guess.

Two Tiptap encodings appear:
- **stringified** doc (a JSON string) — used for question `stem`/`rationale`
  (TEXT columns) and for option / row / column / token `text` fields inside
  `content` (JSONB).
- **nested object** doc — used for tab cell `content` and narrative entry
  `body` (because `entries` is JSONB).

Minimal Tiptap doc: `{"type":"doc","content":[{"type":"paragraph","attrs":{"textAlign":"left"},"content":[{"type":"text","text":"..."}]}]}`.
Empty-color `textStyle` marks and trailing empty paragraphs are editor
artifacts — clean plain text nodes render identically and are accepted.

## nclex_bank_items columns

`item_id, question_type, stem (TEXT=tiptap-str), rationale (TEXT=tiptap-str),
content (jsonb), correct (jsonb), instruction (NULL — cue goes in stem),
marks (1), is_published (false), is_builder_visible (true), tags ('{}'),
parent_case_id (case children), trend_id (bow-tie/trend questions),
client_needs_category / nursing_subject / body_system / topic / subtopic /
difficulty (all nullable — leave NULL, flag to user).`

## Cue → question type

| Doc phrasing | Type |
|---|---|
| "Select all that apply" | SATA |
| "Which N …" (explicit count) | SELECT_N (`select_count=N`) |
| "For each … click to specify … [one column per row]" | MATRIX |
| "For each … may support more than one …" | MATRIX_MR |
| "Complete the sentence … drop-down" | CLOZE |
| "Complete the diagram by dragging …" (2+1+2) | BOWTIE |

## content / correct per type

**SATA** — `content {options:[{id:"A",text:<tiptap-str>},…]}` ·
`correct {answers:["B","C",…], feedback:{}}`

**SELECT_N** — `content {options:[…], select_count:4}` ·
`correct {answers:["B","D",…], feedback:{}}`

**MATRIX** (single per row, radio) —
`content {rows:[{id:"r1",text:<tiptap-str>},…], columns:[{id:"c1",text:<tiptap-str>},…], row_label:<tiptap-str>}` ·
`correct {cells:{r1:"c3", r2:"c1", …}, feedback:{}}` (one column string per row)

**MATRIX_MR** (multi per row, checkbox) — same `content` shape as MATRIX ·
`correct {cells:{r1:["c1"], r3:["c1","c2"], …}, feedback:{}}` (array per row;
each row must have ≥1)

**CLOZE** — `content {blanks:[{id:"b1",choices:[{id:"c1",text:"PLAIN text"},…]},…]}`
(choice text is PLAIN, not Tiptap) · `correct {answers:{b1:"c2", …}, feedback:{}}`.
Stem carries `{1}`, `{2}` inline markers as plain text.

**BOWTIE** — 2 + 1 + 2:
```
content {
  left:   {label:"Actions to take",      tokens:[{id:"lt1",text:<tiptap-str>},…]},
  centre: {label:"Condition",            tokens:[{id:"ct1",…},…]},
  right:  {label:"Parameters to monitor",tokens:[{id:"rt1",…},…]}
}
correct { left:["lt1","lt5"], right:["rt1","rt5"], centre:"ct2", feedback:{} }
```
(left/right = arrays of 2; centre = single string.)

**Not yet templated here** (pull the shape from an existing authored row the
first time one appears, then add it): `MCQ, TF, HIGHLIGHT, DRAG_CLOZE,
DRAG_ORDER`. (`MCQ`/`TF` are option-list like SATA; the marker-stem types put
their markers in the stem.)

## Wrapper tables

**nclex_case_studies**: `case_id, title, scenario_summary (TEXT=tiptap-str),
tags, is_free_sample (false), is_builder_visible (true), is_published (false)`.

**nclex_case_study_items** (join): `id (<CASE>_ITEM_<n>), case_id, item_id,
position (1..6), cjmm_step`.

**nclex_case_study_tabs**: `tab_id (<CASE>_TAB_<n>), case_id, tab_key, title,
display_order (0-based), is_custom, custom_shape, columns_def ('[]'), entries
(jsonb)`.

**nclex_trend_datasets**: `trend_id, title, scenario (TEXT=tiptap-str),
is_published (false), is_free_sample (false), is_builder_visible (true), tags`.
**nclex_trend_tabs**: same column shape as case tabs (`<TREND>_TAB_1`).

### tab_key / is_custom / custom_shape map

| Tab kind | tab_key | is_custom | custom_shape | entries shape |
|---|---|---|---|---|
| Nurses' Notes | `nurses_notes` | false | null | narrative |
| Diagnostics | `diagnostics` | false | null | narrative |
| Orders | `orders` | false | null | narrative |
| Vital Signs / Labs (merge table) | `custom_grid` | true | `rows_cols` | tables |
| Free narrative (Medications, etc.) | `custom_narrative` | true | `free_text` | narrative |

(Built-in narrative keys exist for the common ones; anything without a built-in
key uses `custom_narrative`. Vitals/labs use `custom_grid` so you can build the
rotated / merged structure.)

## entries shapes (v2)

**Narrative** (`nurses_notes` / `custom_narrative` / `orders` / `diagnostics`):
```
{"v":2,"entries":[
  {"id":"e0","body":<tiptap-object-doc>,"chips":["12:00"],"visibleFrom":1},
  … ]}
```
`chips` = the timestamp label(s) (formatted `HH:MM`), lifted OUT of the body.
`body` may hold multiple paragraphs (e.g. a medication or orders list).

**Merge table** (`custom_grid`):
```
{"v":2,"tables":[{
  "id":"t0","cols":<n>,
  "grid":[ [ <cell>, … ],  … ],          // array of rows; each row = array of cells
  "rows":[ {"id":"r0","visibleFrom":1}, {"id":"r1","visibleFrom":2}, … ]
}]}
cell = {"id":"c0","colspan":1,"rowspan":1,"content":<tiptap-object-doc>,"covered":false,"heading":true|false}
```
- **Rotated vitals**: row 0 = metric headers `[Time, Temperature, Pulse, RR,
  B/P, Saturations]` (first cell `heading:false`, rest `heading:true`); each
  later row = one timepoint `[12:00, 99.5 …, 118, …]` with its own `visibleFrom`.
- **Merges**: a spanning cell has `colspan`/`rowspan`>1; the cells it covers are
  emitted as `covered:true` placeholders. `rows[].visibleFrom` drives reveal;
  spans are recomputed against visible rows at render.
- A tab holds a LIST of tables — a standalone bow-tie/trend snapshot commonly
  puts several **banner tables** (Nurses' Notes / Vital Signs / Labs) in one
  `custom_grid` tab, each led by a full-width centred italic-bold heading row
  (heading cell `colspan=cols` + `covered:true` fillers), all `visibleFrom:1`.
