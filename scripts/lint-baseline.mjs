// scripts/lint-baseline.mjs
//
// Guards the lint count against drift.
//
// WHY THIS EXISTS. On 2026-08-20 the repo had 47 ESLint errors, none of them
// new — the oldest dated to the first commit. They had accumulated because
// nothing could answer the only question that matters day to day: "is this
// one MINE?" Sessions linted the files they touched (`eslint app components
// lib`), which is a reasonable habit but cannot see a total, and the session
// logs then wrote that up as "eslint clean" — a scoped check described in
// words that promise a whole-repo one. A repo-wide check was run once, in
// June, and correctly recorded ~42 as pre-existing; it predicted the errors
// "would bite a release build", which turned out to be false (nothing runs
// lint in CI, and Next 16 dropped the lint step inside `next build`), so the
// warning was discredited by its own prediction and the item aged out.
//
// This script exists so that question costs one second.
//
// WHAT IT DOES. `--check` re-runs ESLint and compares against
// `.eslint-baseline.json`, which records how many errors each (file, rule)
// pair is KNOWN to have. Anything above the recorded count is new, and is
// named. Anything below means someone fixed something, which is reported as
// good news, not a failure — rerun with `--update` to bank it.
//
// WHY COUNTS AND NOT LINE NUMBERS. Line numbers move every time anyone edits
// a file, so a line-based baseline would cry wolf on ordinary work and be
// ignored within a week — the exact failure this is meant to end. A count per
// file per rule survives edits and still catches a genuinely new violation,
// including one added to a file that already offends.
//
// THE GATE IS ERRORS ONLY. Warnings are reported when they drift, but never
// fail the check. Errors are the line being held.
//
// ⚠ `--staged` EXISTS BECAUSE THE FULL RUN IS TOO SLOW TO BE A HOOK. Linting
// the whole repo takes ~71s. A pre-commit hook that costs 71s is a hook people
// learn to pass `--no-verify` to, which is worse than no hook at all — it
// teaches the bypass. `--staged` lints only the files in the commit and
// compares just those against the baseline, which takes a few seconds. It is
// no less strict for a session's own work: these rules are file-local, so a
// new error lands in a file you changed.
//
// ⚠ RENAMES WILL TRIP IT. The baseline is keyed by file path, so moving a file
// that carries known errors reads as "the old path was fixed, the new path is
// new". Nothing is wrong — re-run `npm run lint:baseline` as part of the
// rename commit. It fails loudly rather than quietly, which is the right way
// round, but the first person to hit it will otherwise think it is broken.
//
// Usage:
//   npm run lint:check     compare the whole repo against the baseline
//   npm run lint:staged    same, but only files staged for commit (the hook)
//   npm run lint:baseline  re-record the baseline (do this deliberately)

import { ESLint } from 'eslint';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = join(repoRoot, '.eslint-baseline.json');
const mode = process.argv.includes('--update')
  ? 'update'
  : process.argv.includes('--staged')
    ? 'staged'
    : 'check';

/** Extensions ESLint is configured to read. Anything else in a commit is skipped. */
const LINTABLE = /\.(m?[jt]sx?|cjs)$/;

/** Files staged for the current commit (added/copied/modified/renamed — not deleted). */
function stagedFiles() {
  const out = execFileSync(
    'git',
    ['diff', '--cached', '--name-only', '--diff-filter=ACMR'],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  return out.split('\n').map((s) => s.trim()).filter((s) => s && LINTABLE.test(s));
}

/** Repo-relative, forward slashes — so a baseline is portable across machines. */
function relKey(absPath) {
  return relative(repoRoot, absPath).split('\\').join('/');
}

/** Run ESLint over `targets` and tally errors/warnings per file+rule. */
async function collect(targets = ['.']) {
  // `warnIgnored: false` keeps a staged-but-ignored file (say, something under
  // `.claude/`) from reporting as a problem of its own.
  const eslint = new ESLint({ cwd: repoRoot, warnIgnored: false });
  const results = await eslint.lintFiles(targets);

  const counts = {};
  let errors = 0;
  let warnings = 0;

  for (const result of results) {
    for (const message of result.messages) {
      // A message with no ruleId is a parse/config problem (e.g. an unused
      // disable directive). Bucket it under a readable name rather than null.
      const rule = message.ruleId ?? '(no rule — parse or directive)';
      const file = relKey(result.filePath);
      const bucket = (counts[file] ??= {});
      const entry = (bucket[rule] ??= { errors: 0, warnings: 0 });

      if (message.severity === 2) {
        entry.errors += 1;
        errors += 1;
      } else {
        entry.warnings += 1;
        warnings += 1;
      }
    }
  }

  return { counts, errors, warnings };
}

/** Sort keys so the committed file has a stable diff between runs. */
function sortDeep(counts) {
  const out = {};
  for (const file of Object.keys(counts).sort()) {
    out[file] = {};
    for (const rule of Object.keys(counts[file]).sort()) {
      out[file][rule] = counts[file][rule];
    }
  }
  return out;
}

let targets = ['.'];
if (mode === 'staged') {
  targets = stagedFiles();
  if (targets.length === 0) {
    console.log('No lintable files staged — nothing to check.');
    process.exit(0);
  }
}

const { counts, errors, warnings } = await collect(targets);

if (mode === 'update') {
  const baseline = {
    note:
      'Generated by `npm run lint:baseline`. Do not hand-edit. Each entry is ' +
      'how many problems a file is KNOWN to have for a rule; `npm run lint:check` ' +
      'fails only when a count goes UP. See scripts/lint-baseline.mjs for why.',
    totals: { errors, warnings },
    counts: sortDeep(counts),
  };
  writeFileSync(baselinePath, JSON.stringify(baseline, null, 2) + '\n');
  console.log(`Baseline written: ${errors} errors, ${warnings} warnings across ${Object.keys(counts).length} files.`);
  process.exit(0);
}

// ── check mode ────────────────────────────────────────────────────────────
let baseline;
try {
  baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
} catch {
  console.error(`No baseline found at ${relKey(baselinePath)}.`);
  console.error('Create one with:  npm run lint:baseline');
  process.exit(2);
}

const base = baseline.counts ?? {};
const added = [];
const fixed = [];
const warnDrift = [];

for (const [file, rules] of Object.entries(counts)) {
  for (const [rule, entry] of Object.entries(rules)) {
    const wasErrors = base[file]?.[rule]?.errors ?? 0;
    const wasWarnings = base[file]?.[rule]?.warnings ?? 0;
    if (entry.errors > wasErrors) added.push({ file, rule, was: wasErrors, now: entry.errors });
    if (entry.warnings > wasWarnings) warnDrift.push({ file, rule, was: wasWarnings, now: entry.warnings });
  }
}

// Only meaningful for a whole-repo run. In `--staged` mode the files that were
// not linted are absent from `counts`, and reading that as "fixed" would report
// the entire backlog as repaired on every commit.
if (mode !== 'staged') {
  for (const [file, rules] of Object.entries(base)) {
    for (const [rule, entry] of Object.entries(rules)) {
      const nowErrors = counts[file]?.[rule]?.errors ?? 0;
      if (nowErrors < (entry.errors ?? 0)) fixed.push({ file, rule, was: entry.errors, now: nowErrors });
    }
  }
}

const wasTotal = baseline.totals?.errors ?? 0;

if (added.length > 0) {
  console.error(
    mode === 'staged'
      ? `\nNEW lint errors in the files you are committing:\n`
      : `\nNEW lint errors — ${wasTotal} known, ${errors} now:\n`,
  );
  for (const a of added) {
    console.error(`  ${a.file}`);
    console.error(`      ${a.rule}: ${a.was} → ${a.now}`);
  }
  console.error('\nRun `npx eslint <file>` to see them in full.');
  console.error('If a new one is genuinely unavoidable, disable it AT THE LINE with a');
  console.error('comment saying why, so the reason survives — do not re-baseline to hide it.\n');
  process.exit(1);
}

if (fixed.length > 0) {
  console.log(`\nBetter than baseline — ${wasTotal} known, ${errors} now:\n`);
  for (const f of fixed) console.log(`  ${f.file}\n      ${f.rule}: ${f.was} → ${f.now}`);
  console.log('\nBank it with:  npm run lint:baseline\n');
  process.exit(0);
}

if (warnDrift.length > 0) {
  console.log(`No new errors (${errors}). New warnings, which do not fail this check:`);
  for (const w of warnDrift) console.log(`  ${w.file} — ${w.rule}: ${w.was} → ${w.now}`);
  process.exit(0);
}

console.log(
  mode === 'staged'
    ? `No new lint errors in ${targets.length} staged file${targets.length === 1 ? '' : 's'}.`
    : `No new lint errors. ${errors} known errors, ${warnings} warnings — unchanged.`,
);
process.exit(0);
