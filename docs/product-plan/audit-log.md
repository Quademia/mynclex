# Authorship & Change History (Audit Log)

*Living document. Started 2026-06-05. Canonical home for the
**product-wide** "who created / who last edited" + contributor-history
system across all authored content. **Built bank-first**, but designed to
fold in library notes, quizzes, programmes and any future authored
content (one trigger line each — see Step 3). Part of
`mynclex/docs/product-plan/`.*

Last updated: 2026-06-05 (Step 2 — the readout — built across the bank
lists, the case + trend wrapper topbars, and all 9 question editors)

---

## Why

Authored content has many editors. Multiple people can hold `BANK_CURATE`
and curate the shared QAcademy bank; the tutor side will gain
**co-tutors**; and the same "who touched this" need applies to library
notes, quizzes, and programmes. The content tables have `created_at` /
`updated_at` (the *when*) but no record of *who* — zero attribution. We
want **who created** + **who last edited**, and ideally the **full
contributor history over time**, across *all* authored content — so the
system is generic from day one, even though we wire up the **bank first**.

## Decision — an append-only audit LOG (not `created_by`/`updated_by` columns)

Two columns (`created_by` + `updated_by`) would only ever capture the
creator and the **most recent** editor — every new edit overwrites
`updated_by`, so intermediate contributors are lost. An **append-only
log** stores **one row per action**, so:

- nothing is ever overwritten — "who created" is permanent;
- the full contributor timeline is preserved.

It is **not** full version history (no per-field diffs) — that's a larger
future option (see Step 3+). The log captures *who/when/what-action*, not
*what changed*.

### Realm split (two tables)

Mirrors the bank's parallel-ownership model and keeps RLS simple (one
clean rule per table instead of one branchy policy):

- **`nclex_audit_log`** — admin / QAcademy realm. Read-gated by
  `BANK_CURATE`. `owner_tutor_id` always NULL.
- **`nclex_tutor_audit_log`** — tutor realm. Read-scoped to
  `owner_tutor_id = auth.uid()` (+ `SUPER_ADMIN`). `owner_tutor_id`
  required.

**Identical column set** on both (per the "keep the tables similar"
convention) — `owner_tutor_id` is the only realm-specific column (null on
admin, NOT NULL on tutor). Library / quizzes / programmes (all
tutor-owned) will fold into the tutor log; admin bank content into the
admin log.

### Columns (both tables)

`id` · `entity_type` · `entity_id` · `action` (`created` | `updated`) ·
`owner_tutor_id` · `changed_by` (uuid → nclex_users) · `changed_by_name`
(text) · `changed_at`.

- We store **both** `changed_by` (uuid, for reliable filtering / "is this
  me" / dedup) **and** `changed_by_name` — **option B**: the display name
  (**full name**, email fallback) captured **at write time**.
- Why store the name (point-in-time): it **survives the editor renaming
  or their account being deleted** (the uuid nulls on delete; the name
  stays), and the read/UI side needs **no lookup through `nclex_users`'
  locked-down RLS** (a curator can only read their *own* user row). A
  resolver (option A) was rejected for those two reasons.

### The trigger (how capture works)

One shared `SECURITY DEFINER` function **`nclex_write_audit`**, wired to
the six content tables via six `AFTER INSERT OR UPDATE` triggers. Each
trigger passes its specifics as arguments — `(entity_type, pk_column,
realm)` — and the function reads the row's id (and, for tutor rows,
`tutor_id`) **generically via `to_jsonb(NEW)`**, so one function serves
all six tables despite their different id-column names. It resolves the
editor's name once at write time (full name, email fallback). It is the
**sole writer** to the logs (users have read-only, scoped SELECT and no
write policies) → the history is **tamper-proof and append-only**.

`auth.uid()` is null for system / seed / direct-SQL writes → `changed_by`
+ `changed_by_name` left blank (correct: not a person).

## Status

- **Step 1 — data capture: ✅ BUILT + applied to dev + verified.**
  Migration `db/migrations/20260630120000_audit_log_bank.sql` (the two
  tables, the function, six triggers, RLS, indexes). Verified end-to-end
  on a real logged-in edit (created vs updated, admin vs tutor routing,
  owner + the user's id AND name all captured). **Ships to prod at the
  next release** (queues after the 3 Cohort Analytics migrations).
  **Not retroactive** — existing content has no recorded creator; history
  accrues from now on.

- **Step 2 — the readout (app-only, no DB): ✅ BUILT.** "Created by X ·
  Last edited by Y" + a 🕑 clock that opens the full append-only history
  in a **body-portaled drawer**, across **three surfaces**:
  - the **6 bank lists** (case/trend × admin/tutor + both `/bank/all`
    question lists) — a stacked **"Authors"** column;
  - the **case + trend wrapper editor topbars** — the wrapper's own
    authorship, after the breadcrumb;
  - **all 9 question editors** — a facts line atop each editor body,
    covering both the standalone pop-up AND the embedded child-question
    editor.

  *created* = the `created` row, *last edited* = the newest row, displaying
  `changed_by_name` directly (no lookup). Each entity shows its **own**
  history — a case's questions never roll up into the case row. Pre-tracking
  content shows **"—"** until next edited (not retroactive).

  Built as a product-wide, **entity-generic `lib/audit/` module**:
  `authorship.ts` (batched facts), `timeline-actions.ts` (lazy timeline +
  single-entity facts action), `history-drawer.tsx` (clock + drawer),
  `authorship-line.tsx` (list-cell · inline · editor variants), and
  `gates.ts` (a per-`entity_type` access-gate registry). Server-rendered
  lists/wrappers pass facts as props; the client-mounted editors fetch
  their own, so the same component is host-agnostic (pop-up or embedded).
  Commits `6707eb1` (lists) · `b072df1` (wrappers) · `fb20b7b` (editors).

- **Step 3 — later: ⬜.** The history **drawer already exists** (Step 2),
  so the "timeline viewer" is essentially done. What remains is **folding
  in other content** (library notes, quizzes, programmes): one trigger line
  each — `nclex_write_audit('<type>', '<pk_col>', 'admin'|'tutor')` — **plus
  one line in `lib/audit/gates.ts`** registering its access gate, then reuse
  the same components with the new `entity_type`. Tutor-owned content needs
  an owner column — if it isn't named `tutor_id`, pass it as a 4th trigger
  argument (trivial generalization). Optional: extend to a full field-level
  diff history.

## Related

- Sibling work shipped the same session — the **publish-integrity** gates
  on the case/trend wrappers + the published/draft list pills. See
  `BUILD_LIST.md` and `sessions/2026-06.md` (2026-06-05).
- The bank's parallel-ownership model + RLS helpers
  (`nclex_user_has_permission`, `nclex_user_has_role`) live in
  `db/rls.sql`; see also `bank.md`.
