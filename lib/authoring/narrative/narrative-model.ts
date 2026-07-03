// mynclex/lib/authoring/narrative/narrative-model.ts
//
// Rich-content relook — Slice 4. Data model for the v2 custom NARRATIVE tab
// (the rich rebuild of the free-text / Nurses'-Notes-style tab).
//
// A narrative tab is a list of entry cards. Each entry carries free-text
// label "chips" (0..N — generalising the old single hardcoded Time field;
// decision 9) + a rich body + a per-entry reveal point. Stored as `v: 2` in
// the existing nclex_case_study_tabs.entries JSONB on a custom_narrative tab
// (no migration; legacy v1 narrative tabs keep the old array shape).
//
// Pure, free of @tiptap — usable on server + client.

import type { RichDoc } from '../rich-doc';
import { EMPTY_RICH_DOC, richDocToPlain } from '../rich-doc';
import { docHasFilledBankImage } from '../bank-image-doc';

export interface NarrativeEntry {
  id:          string;
  visibleFrom: number;   // 1..6 — the question this entry first appears at
  chips:       string[]; // free-text labels (Time · Day 1 · ED · 0900 · …)
  body:        RichDoc;
}

export interface NarrativeTabData {
  v:       2;
  entries: NarrativeEntry[];
}

export const NT_VERSION = 2 as const;
export const NVF_MAX = 6;

// ── id generation ──
function maxEntryNum(entries: NarrativeEntry[]): number {
  let max = 0;
  for (const e of entries) {
    if (e.id.startsWith('e')) {
      const n = parseInt(e.id.slice(1), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max;
}
function nextEntryId(tab: NarrativeTabData): string {
  return 'e' + (maxEntryNum(tab.entries) + 1);
}

// ── construction ──
export function emptyEntry(id: string): NarrativeEntry {
  return { id, visibleFrom: 1, chips: [], body: { ...EMPTY_RICH_DOC } };
}

/** A fresh narrative tab — one blank entry to start. */
export function emptyNarrativeTab(): NarrativeTabData {
  return { v: NT_VERSION, entries: [emptyEntry('e0')] };
}

function clone(tab: NarrativeTabData): NarrativeTabData {
  return JSON.parse(JSON.stringify(tab)) as NarrativeTabData;
}

// ── entry ops (pure — return a new tab) ──
export function addEntry(prev: NarrativeTabData): NarrativeTabData {
  const tab = clone(prev);
  tab.entries.push(emptyEntry(nextEntryId(tab)));
  return tab;
}

export function removeEntry(prev: NarrativeTabData, idx: number): NarrativeTabData {
  const tab = clone(prev);
  if (idx >= 0 && idx < tab.entries.length) tab.entries.splice(idx, 1);
  return tab;
}

export function setEntryBody(prev: NarrativeTabData, idx: number, body: RichDoc): NarrativeTabData {
  const tab = clone(prev);
  if (tab.entries[idx]) tab.entries[idx].body = body;
  return tab;
}

export function setEntryVisibleFrom(prev: NarrativeTabData, idx: number, v: number): NarrativeTabData {
  const tab = clone(prev);
  if (tab.entries[idx]) tab.entries[idx].visibleFrom = v;
  return tab;
}

export function setEntryChips(prev: NarrativeTabData, idx: number, chips: string[]): NarrativeTabData {
  const tab = clone(prev);
  if (tab.entries[idx]) tab.entries[idx].chips = chips;
  return tab;
}

// ── reveal (Slice 3-style, simpler: per entry) ──
export interface StudentEntry {
  entry:        NarrativeEntry;
  justRevealed: boolean;
}

/** Entries visible at question `q` (visibleFrom ≤ q), in order. */
export function studentEntries(tab: NarrativeTabData, q: number): StudentEntry[] {
  const out: StudentEntry[] = [];
  for (const entry of tab.entries) {
    if ((entry.visibleFrom || 1) <= q) {
      out.push({ entry, justRevealed: (entry.visibleFrom || 1) === q && q > 1 });
    }
  }
  return out;
}

export function narrativeTabHasVisibleContent(tab: NarrativeTabData, q: number): boolean {
  return tab.entries.some((e) => (e.visibleFrom || 1) <= q);
}

// ── summaries / guards ──
function entryIsEmpty(e: NarrativeEntry): boolean {
  if (e.chips.some((c) => c.trim().length > 0)) return false;
  // Slice 7 — an image-only body is content: the plain-text flatten
  // yields nothing for a bankImage atom, so ask the doc directly.
  if (docHasFilledBankImage(e.body)) return false;
  return richDocToPlain(e.body).trim().length === 0;
}

/** True when the tab has no entries, or every entry is blank. */
export function isNarrativeEmpty(tab: NarrativeTabData): boolean {
  return tab.entries.length === 0 || tab.entries.every(entryIsEmpty);
}

/** Heal duplicate entry ids (no-op when clean). */
export function dedupeNarrativeIds(tab: NarrativeTabData): NarrativeTabData {
  const seen = new Set<string>();
  let dup = false;
  for (const e of tab.entries) {
    if (seen.has(e.id)) { dup = true; break; }
    seen.add(e.id);
  }
  if (!dup) return tab;
  const fixed = clone(tab);
  fixed.entries.forEach((e, i) => { e.id = 'e' + i; });
  return fixed;
}

// ── type guard / parse ──
/**
 * Narrow an unknown `entries` value to a v2 narrative tab, else null. The v2
 * shape is an object `{ v:2, entries:[…] }`; v1 narrative tabs store a bare
 * ChartEntry[] array (rejected here), and a v2 merge table stores
 * `{ v:2, tables:[…] }` (also rejected — no `entries` array).
 */
export function asNarrativeTab(entries: unknown): NarrativeTabData | null {
  if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return null;
  const obj = entries as Record<string, unknown>;
  if (obj.v !== NT_VERSION || !Array.isArray(obj.entries)) return null;
  const list = (obj.entries as NarrativeEntry[]).map((e, i) => ({
    id:          e.id ?? 'e' + i,
    visibleFrom: e.visibleFrom ?? 1,
    chips:       Array.isArray(e.chips) ? e.chips : [],
    body:        e.body ?? { ...EMPTY_RICH_DOC },
  }));
  return { v: NT_VERSION, entries: list };
}
