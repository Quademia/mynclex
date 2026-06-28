import { describe, it, expect } from 'vitest';
import {
  emptyNarrativeTab,
  addEntry,
  removeEntry,
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
