# `_archive/` — Frozen legacy code

Frozen reference of code that has been replaced by a newer
implementation. Kept for historical/reference value only.

## Rules

1. **Do not import from anything in this folder.** The code paths
   inside `_archive/` are not live and may reference modules that
   have themselves been archived. The folder is excluded from
   TypeScript compilation (see `tsconfig.json` `exclude`).
2. **Do not modify archived code** beyond mechanical renames forced by
   wider refactors. Treat this as a snapshot. If you find a bug in
   archived code, the right fix lives in the live successor.
3. **Folder layout mirrors the original paths.** Something that lived
   at `lib/bank/editors/mcq.tsx` lives here at
   `_archive/lib/bank/editors/mcq.tsx`. Makes "what was here before?"
   trivial to answer with a `cd`.
4. **Underscore-prefix sorts to the top of file listings** — visible
   reminder that this folder is special.

## What's inside

### `lib/bank/` (archived 2026-05-01, slice 14 phase 1)

The pre-rebuild authoring code: editors, parsers, classifications,
case-study and trend wrappers, the `<QuestionAuthoringPanel>` shell,
list/filter views. Replaced by `lib/authoring/` (which is now the
canonical authoring code; rename to `lib/bank/` may follow as a
phase 2).

### `app/(app)/admin/bank/` and `app/(app)/tutor/bank/` legacy routes (archived 2026-05-01)

Legacy `all/`, `cases/`, `trends/` route folders + the orphan
shared files at `admin/bank/` root (`actions.ts`, `form.tsx`,
`editor-shell.tsx`, `initial-to-parsed.ts`, `slot-parser.ts`).
Replaced by the `-v2` variants at the same paths (the `-v2` →
canonical rename is a separate phase 2 swap).

### `app/(app)/admin/sandbox/` (archived 2026-05-01)

Slice 1 read-only sandbox proving the editor file shape end-to-end.
Useful only during the parallel-build phase.

## How to remove a folder from the archive permanently

```bash
git rm -r _archive/<path>
```

Should be very rare. If it ever happens, drop a note in
[SESSIONS.md](../SESSIONS.md) explaining what was removed and why.
