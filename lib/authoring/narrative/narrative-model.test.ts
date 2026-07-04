import { describe, it, expect } from 'vitest';
import {
  emptyNarrativeTab,
  addEntry,
  removeEntry,
  insertEntryAt,
  moveEntry,
  setEntryBody,
  setEntryVisibleFrom,
  setEntryChips,
  studentEntries,
  narrativeTabHasVisibleContent,
  isNarrativeEmpty,
  asNarrativeTab,
  dedupeNarrativeIds,
} from './narrative-model';
import { parseRichDoc } from '../rich-doc';

describe('narrative tab', () => {
  it('emptyNarrativeTab has one blank entry and reads empty', () => {
    const tab = emptyNarrativeTab();
    expect(tab.v).toBe(2);
    expect(tab.entries).toHaveLength(1);
    expect(isNarrativeEmpty(tab)).toBe(true);
  });

  it('add / remove entries with fresh ids', () => {
    let tab = emptyNarrativeTab();
    tab = addEntry(tab);
    expect(tab.entries).toHaveLength(2);
    expect(tab.entries[0].id).not.toBe(tab.entries[1].id);
    tab = removeEntry(tab, 0);
    expect(tab.entries).toHaveLength(1);
  });

  it('chips + body + vf round-trip; content marks it non-empty', () => {
    let tab = emptyNarrativeTab();
    tab = setEntryChips(tab, 0, ['Day 1', 'ED', '0900']);
    tab = setEntryBody(tab, 0, parseRichDoc('Patient alert and oriented.'));
    tab = setEntryVisibleFrom(tab, 0, 3);
    expect(tab.entries[0].chips).toEqual(['Day 1', 'ED', '0900']);
    expect(tab.entries[0].visibleFrom).toBe(3);
    expect(isNarrativeEmpty(tab)).toBe(false);
  });
});

describe('positional insert + reorder', () => {
  // A 3-entry tab with distinguishable bodies + reveals.
  function threeEntries() {
    let tab = emptyNarrativeTab();
    tab = addEntry(tab);
    tab = addEntry(tab);
    tab = setEntryBody(tab, 0, parseRichDoc('first'));
    tab = setEntryBody(tab, 1, parseRichDoc('second'));
    tab = setEntryBody(tab, 2, parseRichDoc('third'));
    tab = setEntryVisibleFrom(tab, 1, 3);
    return tab;
  }

  it('inserts a blank entry mid-list with a fresh id', () => {
    const tab = insertEntryAt(threeEntries(), 1);
    expect(tab.entries).toHaveLength(4);
    expect(tab.entries[1].chips).toEqual([]);
    expect(new Set(tab.entries.map((e) => e.id)).size).toBe(4);
  });

  it('inserts at the edges (0 and length)', () => {
    let tab = insertEntryAt(threeEntries(), 0);
    tab = insertEntryAt(tab, tab.entries.length);
    expect(tab.entries).toHaveLength(5);
    expect(new Set(tab.entries.map((e) => e.id)).size).toBe(5);
  });

  it('the new entry inherits visibleFrom from the reference entry', () => {
    const t = threeEntries(); // entry 1 appears at Q3
    // "insert above entry 1" → boundary 1, inherit entry 1
    expect(insertEntryAt(t, 1, 1).entries[1].visibleFrom).toBe(3);
    // default (no reference): the entry above the line — entry 1
    expect(insertEntryAt(t, 2).entries[2].visibleFrom).toBe(3);
  });

  it('moveEntry swaps neighbours and carries the whole card', () => {
    const t = threeEntries();
    const moved = moveEntry(t, 1, -1);
    expect(moved.entries[0].visibleFrom).toBe(3);       // reveal rode along
    expect(moved.entries[0].id).toBe(t.entries[1].id);  // same card, same id
    expect(moved.entries[1].id).toBe(t.entries[0].id);
    expect(moved.entries[2].id).toBe(t.entries[2].id);  // rest untouched
  });

  it('moveEntry is a no-op at the ends', () => {
    const t = threeEntries();
    expect(moveEntry(t, 0, -1)).toBe(t);
    expect(moveEntry(t, 2, 1)).toBe(t);
  });
});

describe('narrative reveal', () => {
  it('reveals entries as the question advances', () => {
    let tab = emptyNarrativeTab();
    tab = addEntry(tab);
    tab = setEntryVisibleFrom(tab, 1, 4);
    tab = setEntryBody(tab, 0, parseRichDoc('first'));
    tab = setEntryBody(tab, 1, parseRichDoc('second'));
    expect(studentEntries(tab, 1)).toHaveLength(1);
    expect(studentEntries(tab, 4)).toHaveLength(2);
    expect(studentEntries(tab, 4)[1].justRevealed).toBe(true);
    expect(narrativeTabHasVisibleContent(tab, 1)).toBe(true);
  });
});

describe('asNarrativeTab guard', () => {
  it('accepts v2 narrative, rejects array / merge-table / junk', () => {
    expect(asNarrativeTab(emptyNarrativeTab())).toBeTruthy();
    expect(asNarrativeTab([{ visible_from: 1 }])).toBeNull();        // v1 array
    expect(asNarrativeTab({ v: 2, tables: [] })).toBeNull();         // merge table
    expect(asNarrativeTab({ v: 1, entries: [] })).toBeNull();
    expect(asNarrativeTab(null)).toBeNull();
  });

  it('dedupeNarrativeIds heals duplicate ids', () => {
    const tab = { v: 2 as const, entries: [
      { id: 'e0', visibleFrom: 1, chips: [], body: parseRichDoc('a') },
      { id: 'e0', visibleFrom: 1, chips: [], body: parseRichDoc('b') },
    ] };
    const fixed = dedupeNarrativeIds(tab);
    expect(fixed.entries[0].id).not.toBe(fixed.entries[1].id);
  });
});
